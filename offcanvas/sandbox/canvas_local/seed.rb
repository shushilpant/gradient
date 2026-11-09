# Run only inside the private local Canvas container with synthetic data.
raise 'Refusing non-development seed' unless Rails.env.development?
raise 'Refusing nonlocal Canvas domain' unless File.read(Rails.root.join('config/domain.yml')).include?('127.0.0.1:8080')
email = ENV.fetch('OFFCANVAS_STUDENT_EMAIL') { ENV.fetch('BODHA_STUDENT_EMAIL') { ENV.fetch('GRADIENT_STUDENT_EMAIL') } }
password = ENV.fetch('OFFCANVAS_STUDENT_PASSWORD') { ENV.fetch('BODHA_STUDENT_PASSWORD') { ENV.fetch('GRADIENT_STUDENT_PASSWORD') } }
raise 'Synthetic email required' unless email.end_with?('@offcanvas.local', '@bodha.local', '@gradient.local')
account = Account.default
account.update!(name: 'OffCanvas Local Sandbox', default_time_zone: 'America/Chicago')
pseudonym = Pseudonym.where(account: account, unique_id: email).first_or_initialize
student_name = 'OffCanvas Sandbox Student'
student_names = [student_name, 'Bodha Sandbox Student', 'GRADIENT Sandbox Student']
user = pseudonym.user || User.find_by(name: student_names) || User.create!(name: student_name)
user.name = student_name if student_names.include?(user.name)
user.register! unless user.registered?
user.update!(time_zone: 'America/Chicago')
pseudonym.user = user
pseudonym.password = password
pseudonym.password_confirmation = password
pseudonym.save!
course_code = 'OFFCANVAS-SIGNALS'
course = Course.find_by(account: account, course_code: course_code) ||
  Course.find_by(account: account, course_code: %w[BODHA-SIGNALS GRADIENT-SIGNALS]) ||
  Course.new(account: account, course_code: course_code)
course.course_code = course_code
course.name = 'Signals and Systems · Local Sandbox'
course.workflow_state = 'available'
course.save!
course.enroll_student(user, enrollment_state: 'active')
group = course.assignment_groups.where(name: 'Homework').first_or_create!
assignment = course.assignments.where(title: 'Homework: Time-shift response').first_or_initialize
assignment.assign_attributes(
  assignment_group: group,
  description: '<h2>Time-shift response</h2><ol><li>Plot f(t) = (t-2)*exp(-(t-2))*u(t-2) for 0&lt;=t&lt;=8.</li><li>Explain why the signal is zero before t=2.</li><li>Identify the time and amplitude of its maximum.</li></ol><p>Include the derivation, a labeled graph, and sources. This is synthetic practice homework.</p>',
  points_possible: 100,
  submission_types: 'online_upload',
  due_at: 7.days.from_now.end_of_day,
  workflow_state: 'published'
)
assignment.save!
page = course.wiki_pages.where(url: 'time-shift-study-guide').first_or_initialize
page.title = 'Time-shift study guide'
page.user = user
page.body = '<p>The delayed function f(t) = (t-2)*exp(-(t-2))*u(t-2) is zero before t=2.</p><p>For t&gt;=2, let x=t-2. The derivative of x*exp(-x) is (1-x)*exp(-x), giving a maximum at x=1, t=3, amplitude 1/e.</p>'
page.workflow_state = 'active'
page.save!
puts({user_id: user.id, course_id: course.id, assignment_id: assignment.id, origin: 'http://127.0.0.1:8080', login: '/login/canvas'}.to_json)
