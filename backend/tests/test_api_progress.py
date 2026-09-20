"""Progress endpoints: weight, measurements (append-only), photos, overview."""


def test_weight_log_and_dashboard_reflects_it(client, auth_headers):
    h = auth_headers
    r = client.post("/api/progress/weight", headers=h, json={"weight": 63.6, "date": "2026-09-19"})
    assert r.status_code == 201
    assert r.json()["data"]["weight"] == 63.6

    r = client.post("/api/progress/weight", headers=h, json={"weight": 63.0, "date": "2026-09-12"})
    assert r.status_code == 201

    r = client.get("/api/dashboard", headers=h)
    assert r.status_code == 200
    weight = r.json()["data"]["weight"]
    assert weight["current_kg"] == 63.6
    assert weight["change_30d_kg"] == 0.6
    assert len(weight["spark"]) == 2


def test_weight_validation(client, auth_headers):
    r = client.post("/api/progress/weight", headers=auth_headers, json={"weight": 1500})
    assert r.status_code == 422


def test_measurements_are_append_only(client, auth_headers, db_session):
    from app.models.progress import BodyMeasurement

    h = auth_headers
    for waist in (74.2, 73.6, 73.0):
        r = client.post("/api/progress/measurements", headers=h,
                        json={"waist": waist, "date": "2026-09-19"})
        assert r.status_code == 201
    rows = db_session.query(BodyMeasurement).order_by(BodyMeasurement.id).all()
    assert len(rows) == 3                                   # history preserved
    assert [float(x.waist) for x in rows] == [74.2, 73.6, 73.0]


def test_progress_overview_shape(client, auth_headers):
    h = auth_headers
    client.post("/api/progress/weight", headers=h, json={"weight": 63.6, "date": "2026-09-19"})
    client.post("/api/progress/measurements", headers=h, json={"waist": 73.0, "chest": 98.0})
    r = client.get("/api/progress", headers=h)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["summary"]["current_kg"] == 63.6
    assert len(data["weight_points"]) == 1
    assert data["measurements"][0]["chest"] == 98.0


def test_photo_upload_requires_valid_image(client, auth_headers):
    h = auth_headers
    # text pretending to be a PNG → magic-byte sniff must reject
    r = client.post("/api/progress/photos", headers=h,
                    files={"file": ("fake.png", b"definitely not an image", "image/png")},
                    data={"photo_type": "front"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "content_mismatch"

    # a real 1x1 PNG must pass
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d49444154789c626001000000ffff030000060005"
        "57bfabd40000000049454e44ae426082")
    r = client.post("/api/progress/photos", headers=h,
                    files={"file": ("real.png", png, "image/png")}, data={"photo_type": "front"})
    assert r.status_code == 201, r.text
    assert r.json()["data"]["file_key"].startswith("photos/")
    assert "fake" not in r.json()["data"]["file_key"]        # client filename never used
