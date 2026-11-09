# Only imports an explicit local JSON snapshot into the synthetic development tenant.
require 'json'
require 'digest'
require 'time'
raise 'Refusing non-development mirror' unless Rails.env.development?
raise 'Refusing nonlocal Canvas configuration' unless File.read(Rails.root.join('config/domain.yml')).include?('127.0.0.1:8080')
path = ENV.fetch('BODHA_SNAPSHOT_PATH')
raise 'Snapshot must be staged under /bodha-runtime/imports' unless path.start_with?('/bodha-runtime/imports/') && path.end_with?('.json')
raise 'Snapshot is too large' if File.size(path) > 30 * 1024 * 1024
snapshot = JSON.parse(File.read(path))
snapshot = snapshot['snapshot'] if snapshot['snapshot'].is_a?(Hash)
raise 'Missing course snapshot' unless snapshot['courses'].is_a?(Array) && snapshot['courses'].size <= 100
origin = snapshot.fetch('origin')
raise 'Source must be an HTTPS Canvas origin' unless origin.match?(%r{\Ahttps://(?:(?:[a-zA-Z0-9-]+\.)*instructure\.com|canvas\.usm\.edu)\z})
account = Account.default
raise 'Refusing to import outside synthetic local tenant' unless ['OffCanvas Local Sandbox', 'Bodha Local Sandbox', 'GRADIENT Local Sandbox'].include?(account.name)
student = Pseudonym.where(account: account, unique_id: ENV.fetch('BODHA_STUDENT_EMAIL')).first!.user
student.update!(name: snapshot.dig('user', 'name').presence || student.name)
map_path = '/bodha-runtime/import-map.json'
mapping = File.exist?(map_path) ? JSON.parse(File.read(map_path)) : {}
key = Digest::SHA256.hexdigest(origin)[0, 12]
report = {courses: [], warnings: [], origin: origin, localOrigin: 'http://127.0.0.1:8080'}
def local_record(scope, model_scope, mapping)
  id = mapping[scope]
  id && model_scope.find_by(id: id)
end
ActiveRecord::Base.transaction do
snapshot['courses'].each do |source|
  course_key = "#{key}:course:#{source.fetch('id')}"
  course = local_record(course_key, account.courses, mapping) || account.courses.new
  course.name = source.fetch('name').to_s[0, 255]
  course.course_code = source.fetch('code', course.name).to_s[0, 255]
  course.syllabus_body = source.fetch('syllabusHtml', '').to_s
  course.apply_assignment_group_weights = source.dig('input', 'course', 'applyGroupWeights') == true
  course.workflow_state = 'available'
  course.save!
  mapping[course_key] = course.id
  course.enroll_student(student, enrollment_state: 'active')
  groups = {}
  (source.dig('input', 'groups') || []).each do |item|
    group_key = "#{course_key}:group:#{item.fetch('id')}"
    group = local_record(group_key, course.assignment_groups, mapping) || course.assignment_groups.new
    group.name = item.fetch('name', 'Assignments').to_s[0, 255]
    group.group_weight = item.fetch('weight', item.fetch('groupWeight', 0))
    group.save!
    mapping[group_key] = group.id
    groups[item['id'].to_s] = group
  end
  default_group = course.assignment_groups.first || course.assignment_groups.create!(name: 'Assignments')
  assignments = {}
  (source['assignments'] || []).each do |item|
    assignment_key = "#{course_key}:assignment:#{item.fetch('id')}"
    assignment = local_record(assignment_key, course.assignments, mapping) || course.assignments.new
    assignment.title = item.fetch('name').to_s[0, 255]
    assignment.description = item.fetch('descriptionHtml', '').to_s
    assignment.assignment_group = groups[item['groupId'].to_s] || default_group
    assignment.points_possible = Float(item.fetch('pointsPossible', 0))
    assignment.due_at = item['dueAt'].present? ? Time.iso8601(item['dueAt']) : nil
    assignment.omit_from_final_grade = item['omitFromFinalGrade'] == true
    # Quizzes/LTIs are not reconstructed as working assessments or external launches.
    types = Array(item['submissionTypes']) & %w[online_upload online_text_entry online_url none on_paper]
    assignment.submission_types = (types.presence || ['none']).join(',')
    assignment.workflow_state = 'published'
    assignment.save!
    mapping[assignment_key] = assignment.id
    assignments[item['id'].to_s] = assignment
    if item['rubric'].is_a?(Array) && item['rubric'].any?
      criteria = item['rubric'].map do |criterion|
        "<li><strong>#{ERB::Util.html_escape(criterion['description'])}</strong> (#{ERB::Util.html_escape(criterion['points'].to_s)} points)<ul>" + Array(criterion['ratings']).map { |rating| "<li>#{ERB::Util.html_escape(rating['description'])}: #{ERB::Util.html_escape(rating['points'].to_s)}</li>" }.join + '</ul></li>'
      end.join
      assignment.update!(description: assignment.description.to_s + "<h3>Published rubric copied from source</h3><ul>#{criteria}</ul>")
    end
    submission_data = item['submission']
    if submission_data.is_a?(Hash) && submission_data['score'].is_a?(Numeric)
      submission = assignment.find_or_create_submission(student, skip_grader_check: true)
      submission.skip_grader_check = true
      submission.score = submission_data['score']
      submission.grade = submission_data['score'].to_s
      submission.workflow_state = 'graded'
      submission.posted_at = submission_data['posted'] == false ? nil : Time.current if submission.respond_to?(:posted_at=)
      submission.excused = submission_data['excused'] == true
      submission.save!
    end
  end
  # Keep group drop rules, rewriting never-drop source assignment IDs to local IDs.
  (source.dig('input', 'groups') || []).each do |item|
    group = groups[item['id'].to_s]
    next unless group
    rules = item['rules'] || {}
    group.update!(rules_hash: {'drop_lowest' => rules.fetch('dropLowest', rules.fetch('drop_lowest', 0)), 'drop_highest' => rules.fetch('dropHighest', rules.fetch('drop_highest', 0)), 'never_drop' => Array(rules['neverDrop'] || rules['never_drop']).filter_map { |id| assignments[id.to_s]&.id }})
  end
  (source['announcements'] || []).each do |item|
    announcement_key = "#{course_key}:announcement:#{item.fetch('id')}"
    topic = local_record(announcement_key, course.announcements, mapping) || course.announcements.new
    topic.title = item.fetch('title', 'Announcement').to_s[0, 255]
    topic.message = item.fetch('bodyHtml', '').to_s
    topic.user = student
    topic.workflow_state = 'active'
    topic.save!
    mapping[announcement_key] = topic.id
  end
  (source['resources'] || []).each do |item|
    next unless item['type'] == 'page' && item['bodyHtml'].is_a?(String)
    page_key = "#{course_key}:page:#{item.fetch('id')}"
    page = local_record(page_key, course.wiki_pages, mapping) || course.wiki_pages.new
    page.title = item.fetch('title', 'Course page').to_s[0, 255]
    page.user = student
    page.body = item['bodyHtml']
    page.workflow_state = 'active'
    page.save!
    mapping[page_key] = page.id
  end
  course.recompute_student_scores([student.id], run_immediately: true)
  report[:courses] << {sourceId: source['id'], localId: course.id, name: course.name, assignments: assignments.size, url: "http://127.0.0.1:8080/courses/#{course.id}"}
end
# Only captured scalar color variables supported by Canvas's own brand schema.
theme = snapshot['theme'] || {}
captured = (theme['variables'] || theme['brandVariables'] || {}).dup
{ 'primary' => ['ic-brand-primary'], 'navigation' => ['ic-brand-global-nav-bgd'], 'navigationText' => ['ic-brand-global-nav-ic-icon-svg-fill', 'ic-brand-global-nav-menu-item__text-color'] }.each do |field, names|
  names.each { |name| captured[name] = theme[field] if theme[field].present? }
end
variables = captured.each_with_object({}) do |(name, value), result|
  canonical = name.to_s.delete_prefix('--')
  next unless BrandableCSS.variables_map.key?(canonical) && canonical.start_with?('ic-brand-')
  next unless value.is_a?(String) && value.match?(/\A(?:#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\))\z/)
  result[canonical] = value
end
unless variables.empty?
  brand = BrandConfig.for(variables: variables)
  brand.save_unless_dup!
  brand.save_all_files!
  account.update!(brand_config_md5: brand.md5)
end
report[:themeVariablesApplied] = variables.keys
report[:warnings] = ['Mirrored student-visible snapshot only; unpublished material, institutional SSO, paid/LTI tools and missing files are not copied.', 'Rubric text is preserved in assignment descriptions; rubric-association parity has not been established.', 'Own visible numeric grades are copied locally; instructor grading policies and hidden grades remain unknown.', 'Captured theme colors are applied through Canvas branding; external logo files, custom JavaScript/CSS and arbitrary fonts are not fetched.']
report[:warnings].concat(Array(snapshot['mirrorWarnings']).first(100).map { |warning| warning.to_s[0, 1000] })
end # Commit the whole mirror before persisting source-to-local IDs.
File.write(map_path, JSON.pretty_generate(mapping))
File.write('/bodha-runtime/last-import.json', JSON.pretty_generate(report))
File.chmod(0600, map_path, '/bodha-runtime/last-import.json')
puts JSON.generate(report)
