"""Turns Pydantic validation errors into field-level Hebrew messages the gate UI can highlight."""

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .catalog import get_catalog


def _field_path(loc: tuple) -> str:
    parts = [str(p) for p in loc if p != "body"]
    return ".".join(parts) or "body"


def labels_for(key: str) -> str:
    return get_catalog().field_labels[key]


def _message(error: dict, label: str) -> str:
    kind = error["type"]
    if kind == "missing":
        if label == labels_for("income"):
            return "חסרה ההכנסה החודשית נטו — בלעדיה אי אפשר לבנות תוכנית."
        if label == labels_for("unexpected"):
            return "השדה הזה חובה — בלת\"מים קורים לכולם."
        return f"חסר: {label}. אין הוצאה כזו? כתבו 0."
    if kind == "greater_than":
        if label == labels_for("unexpected"):
            return "חובה לשריין סכום לבלת\"מים — גם ₪100 בחודש עדיף על כלום."
        return f"{label} חייב להיות גדול מ-0."
    if kind == "greater_than_equal":
        return f"{label} לא יכול להיות שלילי."
    if kind == "less_than_equal":
        return f"הסכום ב{label} גבוה מדי. בדקו שלא נוספה ספרה."
    if kind in {"float_type", "float_parsing", "finite_number"}:
        return f"{label}: יש להזין מספר."
    if kind == "extra_forbidden":
        return "שדה לא מוכר."
    if kind == "literal_error":
        return f"ערך לא חוקי עבור {label}."
    if kind == "value_error" and "unknown_track" in error.get("msg", ""):
        return "המסלול שנבחר לא קיים. חזרו ובחרו מסלול."
    return f"{label}: ערך לא תקין."


async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    labels = get_catalog().field_labels | {
        "life_stage": "שלב בחיים",
        "primary_goal": "מטרה",
        "track_id": "מסלול",
        "profile": "פרופיל",
        "fixed": "הוצאות קבועות",
        "variable": "הוצאות משתנות",
    }
    fields = []
    for error in exc.errors():
        path = _field_path(tuple(error["loc"]))
        label = labels.get(path.split(".")[-1], path)
        fields.append({"field": path, "message": _message(error, label)})

    return JSONResponse(
        status_code=422,
        content={
            "error": "incomplete_financial_data",
            "message": "חסרים נתונים כדי לבנות לכם תוכנית. השלימו את השדות המסומנים.",
            "fields": fields,
        },
    )
