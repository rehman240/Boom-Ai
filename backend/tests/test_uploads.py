from sqlalchemy import select

from app.models import Event, Project, Upload
from app.uploads import MAX_FILES_PER_PROJECT

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64
WEBP = b"RIFF" + b"\x00" * 4 + b"WEBP" + b"0" * 64
PDF = b"%PDF-1.7\n" + b"0" * 64
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


def signup(client, email="owner@example.com"):
    return client.post("/auth/signup", json={"email": email, "password": "good-password"})


def start(client):
    signup(client)
    return client.post("/projects", json={"name": "NOVA Desk Lamp"}).json()["id"]


def upload(client, project_id, data=PNG, filename="logo.png", kind="reference", content_type="image/png"):
    return client.post(
        f"/projects/{project_id}/uploads",
        files={"file": (filename, data, content_type)},
        data={"kind": kind},
    )


def test_upload_stores_the_file_and_lists_it(client, storage, db):
    project_id = start(client)
    r = upload(client, project_id, filename="nova-logo.png", kind="logo")
    assert r.status_code == 201
    assert r.json()["original_filename"] == "nova-logo.png"
    assert r.json()["content_type"] == "image/png"
    assert r.json()["size_bytes"] == len(PNG)
    # Where the file lives is the server's business.
    assert "storage_key" not in r.json()

    row = db.scalar(select(Upload).where(Upload.project_id == project_id))
    assert storage.read(row.storage_key) == PNG
    assert db.scalar(select(Event).where(Event.name == "file_uploaded", Event.project_id == project_id))
    assert [u["id"] for u in client.get(f"/projects/{project_id}/uploads").json()] == [r.json()["id"]]


def test_accepts_the_four_allowed_types(client):
    project_id = start(client)
    for data, name in [(PNG, "a.png"), (JPEG, "b.jpg"), (WEBP, "c.webp"), (PDF, "d.pdf")]:
        assert upload(client, project_id, data, name).status_code == 201, name


def test_svg_is_refused_even_when_renamed(client):
    project_id = start(client)
    # Claiming to be a PNG must not help: the bytes decide.
    r = upload(client, project_id, SVG, "logo.png", content_type="image/png")
    assert r.status_code == 415
    assert "SVG" in r.json()["detail"]


def test_a_renamed_text_file_is_refused(client):
    project_id = start(client)
    r = upload(client, project_id, b"just some text, not an image", "logo.png")
    assert r.status_code == 415


def test_empty_and_oversized_files_are_refused(client):
    project_id = start(client)
    assert upload(client, project_id, b"", "empty.png").status_code == 400

    too_big = PNG + b"0" * (5 * 1024 * 1024)
    r = upload(client, project_id, too_big, "big.png")
    assert r.status_code == 413
    assert "5 MB" in r.json()["detail"]


def test_a_new_logo_replaces_the_old_one(client, storage, db):
    project_id = start(client)
    first = upload(client, project_id, PNG, "old.png", kind="logo").json()
    old_key = db.get(Upload, first["id"]).storage_key

    second = upload(client, project_id, JPEG, "new.jpg", kind="logo")
    assert second.status_code == 201

    logos = [u for u in client.get(f"/projects/{project_id}/uploads").json() if u["kind"] == "logo"]
    assert [u["original_filename"] for u in logos] == ["new.jpg"]
    # The replaced file is gone from storage too, not just from the list.
    assert db.get(Upload, first["id"]) is None
    try:
        storage.read(old_key)
        raise AssertionError("the old logo should have been deleted")
    except Exception:
        pass


def test_reference_files_are_capped(client):
    project_id = start(client)
    for i in range(MAX_FILES_PER_PROJECT):
        assert upload(client, project_id, PNG, f"{i}.png").status_code == 201
    r = upload(client, project_id, PNG, "one-too-many.png")
    assert r.status_code == 409
    assert str(MAX_FILES_PER_PROJECT) in r.json()["detail"]


def test_download_serves_the_file_safely(client):
    project_id = start(client)
    image = upload(client, project_id, PNG, "logo.png").json()
    doc = upload(client, project_id, PDF, "brand.pdf").json()

    r = client.get(f"/projects/{project_id}/uploads/{image['id']}/file")
    assert r.status_code == 200
    assert r.content == PNG
    assert r.headers["content-type"] == "image/png"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["content-disposition"].startswith("inline")

    # A PDF is downloaded rather than opened in place.
    r = client.get(f"/projects/{project_id}/uploads/{doc['id']}/file")
    assert r.headers["content-disposition"].startswith("attachment")


def test_delete_removes_the_row_and_the_file(client, storage, db):
    project_id = start(client)
    item = upload(client, project_id).json()
    key = db.get(Upload, item["id"]).storage_key

    assert client.delete(f"/projects/{project_id}/uploads/{item['id']}").status_code == 204
    assert client.get(f"/projects/{project_id}/uploads").json() == []
    try:
        storage.read(key)
        raise AssertionError("the file should have been deleted")
    except Exception:
        pass


def test_another_users_files_are_out_of_reach(client, db):
    project_id = start(client)
    item = upload(client, project_id).json()

    client.cookies.clear()
    signup(client, email="stranger@example.com")

    assert client.get(f"/projects/{project_id}/uploads").status_code == 404
    assert client.get(f"/projects/{project_id}/uploads/{item['id']}/file").status_code == 404
    assert client.delete(f"/projects/{project_id}/uploads/{item['id']}").status_code == 404
    assert upload(client, project_id).status_code == 404


def test_a_file_from_another_campaign_is_not_served(client):
    project_id = start(client)
    other_id = client.post("/projects", json={"name": "Harbor Workshop"}).json()["id"]
    item = upload(client, project_id).json()

    # Same owner, wrong campaign: the id alone must not be enough.
    assert client.get(f"/projects/{other_id}/uploads/{item['id']}/file").status_code == 404


def test_demo_campaign_files_are_read_only(client, db):
    project_id = start(client)
    item = upload(client, project_id).json()
    db.get(Project, project_id).is_demo = True
    db.flush()

    assert client.get(f"/projects/{project_id}/uploads").status_code == 200
    assert upload(client, project_id).status_code == 403
    assert client.delete(f"/projects/{project_id}/uploads/{item['id']}").status_code == 403


def test_unknown_kind_is_refused(client):
    project_id = start(client)
    assert upload(client, project_id, kind="something-else").status_code == 422


def test_signed_out_user_cannot_upload(client):
    project_id = start(client)
    client.cookies.clear()
    assert upload(client, project_id).status_code == 401
