# Actual Canvas LMS on localhost

This sandbox uses the **official open-source Canvas application**, not the existing
synthetic HTML preview. The source revision is recorded in
`sandbox/canvas_local/upstream.lock.json`. The UI, routes, Rails models and Canvas
API come from that source revision. It is intended for local development only.

A claim that it is one-to-one with a university's hosted tenant would be inaccurate:
we do not know its deployed revision, feature flags, theme, institutional SSO,
paid services, external LTI integrations, or all of its course data. Matching those
requires an authorized export/configuration supplied by the institution. No live
Canvas cookies or institutional credentials are copied into the sandbox.

## Start the actual application

From the `gradient` directory, with a Docker-compatible runtime running:

```sh
python3 sandbox/canvas_local/bootstrap.py --snapshot /absolute/path/to/staged-snapshot.json
```

This builds dependencies, initializes the isolated database once, seeds the local
student, imports the specified snapshot and starts Canvas. Progress is recorded in
`.runtime/bootstrap-state.json`; it claims ready only after a real login-page check.
For individual setup or troubleshooting steps:

```sh
python3 sandbox/canvas_local/setup.py checkout
python3 sandbox/canvas_local/setup.py configure
python3 sandbox/canvas_local/setup.py doctor
python3 sandbox/canvas_local/setup.py build
python3 sandbox/canvas_local/setup.py initialize
python3 sandbox/canvas_local/setup.py seed
python3 sandbox/canvas_local/setup.py up
python3 sandbox/canvas_local/setup.py status
```

Then open [local Canvas](http://127.0.0.1:8080/login/canvas). Synthetic administrator
and student login details are generated in the ignored
`sandbox/canvas_local/.runtime/credentials.json` file with owner-only permissions.
Use the student login when testing GRADIENT. The seed creates an actual Canvas
course, enrolled student, homework and study-guide page through Canvas's Rails
models. The homework has a known computed graph and answer for verification.

`setup.py down` stops this Compose project without deleting volumes.
`setup.py logs` shows the local application logs. No script runs `down --volumes`.
The initial build downloads substantial source/dependencies and compiles Canvas
assets. Instructure's Quick Start recommends at least 150 GB available disk,
8 GB RAM and four CPU cores for its development setup. This Mac has enough RAM
and disk; the configured local VM uses 8 CPUs, 16 GB RAM and a sparse 180 GB disk.

## Isolation

- The only published application port is `127.0.0.1:8080`.
- PostgreSQL and Redis have no host-published ports.
- Canvas, PostgreSQL and Redis share an `internal: true` Docker network. They cannot
  contact the institutional Canvas tenant or send outbound email. A fixed Nginx
  gateway connects that network to the loopback-published port; it forwards only
  to the Canvas service and has no course-file or credential mounts.
- Only dependency installation uses the separate bootstrap network. The regular
  `up` command omits that network.
- Credentials, dependency checkout and runtime logs are ignored by Git. Synthetic
  passwords are generated locally and are not printed to the chat or committed.
- Mail is configured to an unavailable local sink. No SMTP credentials are present.
- `/__gradient_sandbox__/status.json` identifies the application revision and says
  explicitly that institution-specific parity has not been established.
- This development service is not a security boundary against a malicious host
  administrator, a production deployment, or a general-purpose malware sandbox.

GRADIENT's computer-use session must use a separate browser context pointed at
this exact origin. It must not inherit a real Canvas session. It may navigate
and read homework, sources and local output; it does not submit work or mutate
an institutional Canvas account.

## Mirror your visible courses and colors

In GRADIENT Settings, use **Stage my Canvas courses** while signed in to your
institutional Canvas. This stages an explicit local JSON snapshot of the courses
already loaded by GRADIENT. It does not export browser cookies or credentials.
After the real Canvas sandbox is initialized and seeded, apply the returned file:

```sh
python3 sandbox/canvas_local/setup.py import --snapshot /absolute/path/to/snapshot.json
```

The importer runs only in the development container configured for
`127.0.0.1:8080` and the synthetic local account. It creates local course and
assignment IDs and remembers the source-to-local mapping, so applying a snapshot
again updates those records. It preserves assignment descriptions, due dates,
points, supported submission types, assignment-group weights and drop rules,
syllabus HTML, announcements, available page bodies, and your visible numeric
scores. Rubrics are included as assignment-description text. Captured primary,
navigation-background and navigation-text colors use Canvas's own branding API.
The report is written to `.runtime/last-import.json`.

File links and course HTML can still reference the institution; linked bytes are
not silently downloaded and runtime containers cannot access those hosts. Page
bodies absent from the captured snapshot cannot be reconstructed. Institution
logos, custom JavaScript/CSS, fonts, unpublished content, SSO and external tools
require separately authorized source files or configuration. Local grades are
practice data and never synchronize back to the institution. The importer does
not remove records merely because a later partial snapshot omits them.

## Official references

[Instructure Quick Start](https://github.com/instructure/canvas-lms/wiki/Quick-Start)
provides the official installation flow and development limitations.
[Docker development guide](https://github.com/instructure/canvas-lms/blob/master/doc/docker/developing_with_docker.md)
describes upstream images, dependency compilation and database setup. Our Compose
configuration uses the upstream Dockerfiles and config templates, with loopback
publishing and an isolated runtime network rather than the `canvas.docker` proxy.
The database uses [pgvector's official PostgreSQL 14 image](https://github.com/pgvector/pgvector#docker)
to supply Canvas's required vector extension without bootstrapping its apt mirror.
The web Dockerfile uses HTTPS for the official PostgreSQL package repository.
Dependency Git clones use a blob filter to avoid downloading historical media;
the original lockfiles still select the same commits and checkout fetches their files.
