from fastapi.testclient import TestClient
from sandbox.rehearsal import app
client=TestClient(app)

def test_rehearsal_is_explicitly_not_a_canvas_replica_and_reads_consistent_assignments():
    assert client.get('/__gradient_sandbox__').json()['oneToOne'] is False
    courses=client.get('/api/v1/courses').json()
    course_id=courses[0]['id']
    assert courses[0]['enrollments'][0]['type']=='student'
    assignments=client.get(f'/api/v1/courses/{course_id}/assignments').json()
    assignment=assignments[0]
    body=client.get(f'/courses/{course_id}/assignments/{assignment["id"]}').text
    assert 'REHEARSAL FIXTURE' in body and 'Not the Canvas application' in body
    assert 'f(t) = (t-2)' in body
    assert client.get(f'/api/v1/courses/{course_id}/assignments/{assignment["id"]}').json()['description']==assignment['description']
    assert client.post(f'/api/v1/courses/{course_id}/assignments/{assignment["id"]}/submissions',json={}).status_code==405
