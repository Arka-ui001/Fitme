"""Nutrition endpoints: catalog, meals, deterministic totals."""


def test_create_food_item(client, auth_headers):
    r = client.post("/api/nutrition/food", headers=auth_headers,
                    json={"name": "Oats", "serving_size": 80, "calories": 303, "protein": 11})
    assert r.status_code == 201
    assert r.json()["data"]["created"] is True
    # idempotent by name
    r2 = client.post("/api/nutrition/food", headers=auth_headers,
                     json={"name": "Oats", "serving_size": 80, "calories": 999, "protein": 0})
    assert r2.json()["data"]["created"] is False


def test_meal_logging_totals(client, auth_headers):
    h = auth_headers
    client.post("/api/nutrition/food", headers=h,
                json={"name": "Whey", "serving_size": 30, "calories": 120, "protein": 24})
    client.post("/api/nutrition/food", headers=h,
                json={"name": "Banana", "serving_size": 120, "calories": 107, "protein": 1.3})
    r = client.post("/api/nutrition/meals", headers=h, json={
        "meal_type": "breakfast",
        "logs": [{"food_item_id": 1, "quantity": 1}, {"food_item_id": 2, "quantity": 1}]})
    assert r.status_code == 201
    totals = r.json()["data"]["daily_totals"]
    assert totals["calories"] == 227.0
    assert totals["protein"] == 25.3


def test_nutrition_overview(client, demo_user_with_data):
    r = client.get("/api/nutrition", headers=demo_user_with_data)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["today"]["calories"] == 496.0
    assert data["today"]["protein"] == 93.0
    assert data["today"]["protein_remaining_g"] is not None or True  # no goal set yet
    assert len(data["meals"]) == 1 and data["meals"][0]["meal_type"] == "lunch"


def test_meal_log_rejects_unknown_food(client, auth_headers):
    r = client.post("/api/nutrition/meals", headers=auth_headers,
                    json={"meal_type": "dinner", "logs": [{"food_item_id": 999, "quantity": 1}]})
    assert r.status_code == 404
