"""Nutrition engine — deterministic arithmetic (spec: never an LLM)."""
from app.services import nutrition_service as N


class FakeItem:
    def __init__(self, kcal, p, c, f, fib):
        self.calories, self.protein, self.carbohydrates, self.fat, self.fiber = kcal, p, c, f, fib
        self.name = "fake"


def test_serving_totals_scales_linearly():
    item = FakeItem(248, 46.5, 0, 5.4, 0)          # per 150 g serving
    totals = N.serving_totals(item, 2.0)           # 2 servings = 300 g
    assert totals["calories"] == 496.0
    assert totals["protein"] == 93.0
    assert totals["fat"] == 10.8


def test_serving_totals_fractional_quantity():
    item = FakeItem(100, 10, 10, 10, 5)
    totals = N.serving_totals(item, 1.5)
    assert totals["calories"] == 150.0 and totals["protein"] == 15.0 and totals["fiber"] == 7.5


def test_sum_totals_aggregates():
    rows = [{"calories": 100.4, "protein": 10.0, "carbohydrates": 5, "fat": 1, "fiber": 2},
            {"calories": 200.6, "protein": 20.0, "carbohydrates": 5, "fat": 2, "fiber": 3}]
    totals = N.sum_totals(rows)
    assert totals["calories"] == 301.0
    assert totals["protein"] == 30.0 and totals["fiber"] == 5.0


def test_weekly_averages_only_counts_logged_days():
    class Row:
        def __init__(self, d, kcal, p):
            self.date, self.calories, self.protein = d, kcal, p
            self.carbohydrates = self.fat = self.fiber = 0.0

    from datetime import date, timedelta
    day = date(2026, 9, 19)
    rows = [Row(day - timedelta(days=i), 2000 + i * 100, 100 + i) for i in range(4)]  # 4 logged days
    avg = N.weekly_averages(rows, days=7)
    assert avg["days_logged"] == 4
    assert avg["calories"] == (2000 + 2100 + 2200 + 2300) / 4


def test_protein_remaining():
    assert N.protein_remaining(118, 130) == 12.0
    assert N.protein_remaining(135, 130) == 0.0     # never negative
    assert N.protein_remaining(100, None) is None


def test_daily_totals_recomputed_and_persisted(client, demo_user_with_data, db_session):
    """Chicken breast 2 servings: 496 kcal / 93 g protein — derived, not stored by hand."""
    from app.repositories.nutrition_repo import DailyNutritionRepository
    from datetime import date
    row = DailyNutritionRepository(db_session).get(1, date.today())
    assert row is not None
    assert row.calories == 496.0
    assert row.protein == 93.0
