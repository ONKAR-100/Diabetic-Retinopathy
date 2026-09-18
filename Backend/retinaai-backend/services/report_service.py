"""
Professional PDF Report Generator for RetinaAI Screening Platform.
Produces a clinical-quality report with:
  - Header with branding and case metadata
  - Patient information table
  - Image Quality section with scores
  - AI Results: grade, probabilities, confidence (both eyes side by side)
  - Visual Evidence: 2x2 image grid per eye (original, GradCAM, vessel, OD+fovea)
  - Lesion Analysis table (or "Coming Soon" placeholder)
  - Referral Recommendation
  - Human Review section (if reviewed)
  - Medical disclaimer footer
"""

import io
import os
import json
from io import BytesIO
from datetime import datetime
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image as RLImage, HRFlowable, KeepTogether, PageBreak
)
from reportlab.platypus.flowables import BalancedColumns
from PIL import Image as PILImage


# ─── Color Palette (matching RetinaAI design system) ───────────────────────
TEAL_DARK   = colors.HexColor("#0d2123")
TEAL        = colors.HexColor("#0e6264")
TEAL_LIGHT  = colors.HexColor("#e1f1f0")
DANGER      = colors.HexColor("#b73d44")
DANGER_LIGHT= colors.HexColor("#fceced")
WARN        = colors.HexColor("#9a6b15")
WARN_LIGHT  = colors.HexColor("#fcf4df")
GOOD        = colors.HexColor("#1d735c")
GOOD_LIGHT  = colors.HexColor("#e9f6f0")
MUTED       = colors.HexColor("#6c7b7e")
LINE        = colors.HexColor("#dbe5e5")
BG          = colors.HexColor("#f5f8f8")
BLACK       = colors.HexColor("#142426")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

GRADE_NAMES = {
    0: "No DR",
    1: "Mild NPDR",
    2: "Moderate NPDR",
    3: "Severe NPDR",
    4: "Proliferative DR",
}


def grade_color(grade: Optional[int]):
    if grade is None:
        return MUTED
    if grade == 0:
        return GOOD
    if grade == 1:
        return WARN
    return DANGER


def _chex(color) -> str:
    """Return a clean '#RRGGBB' hex string from a ReportLab color.
    ReportLab's hexval() returns '#xRRGGBB' (with 'x' prefix) which is
    invalid inside paragraph XML tags — this strips it to '#RRGGBB'.
    """
    raw = color.hexval()          # e.g. '#xb73d44'
    clean = raw.replace('#', '').replace('x', '')  # 'b73d44'
    return f'#{clean}'            # '#b73d44'


_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def safe_img(path: Optional[str], width_cm: float, height_cm: float) -> Optional[RLImage]:
    """Load an image from either a Supabase private/public URL or a local path into a ReportLab Image.
    Handles:
      - Supabase private/signed/public URLs via backend storage client
      - /api/media/... authenticated media routes
      - Absolute Windows paths  (D:\\...\\static\\results\\...)
      - /static/results/...     (strip leading slash, resolve against backend root)
      - static/results/...      (relative, resolve against backend root)
    """
    if not path:
        return None

    # ── Supabase / remote URL ─────────────────────────────────────────────────
    if path.startswith("http://") or path.startswith("https://"):
        try:
            # 1. Try to download directly via storage_service using backend credentials
            from services.storage_service import storage_service
            try:
                img_data = storage_service.download_bytes_from_url(path)
                return RLImage(io.BytesIO(img_data), width=width_cm * cm, height=height_cm * cm)
            except Exception:
                pass

            # 2. Fallback: urllib request if it is an accessible signed URL
            import urllib.request
            with urllib.request.urlopen(path, timeout=10) as resp:
                img_data = resp.read()
            img_buf = io.BytesIO(img_data)
            img = RLImage(img_buf, width=width_cm * cm, height=height_cm * cm)
            return img
        except Exception:
            return None

    # ── Local path ────────────────────────────────────────────────────────────
    # Normalize backslashes to forward slashes
    path = path.replace("\\", "/")

    # If path contains /api/media/, map to static/
    if "/api/media/" in path:
        path = "static/" + path.split("/api/media/")[1]
    elif path.startswith("/api/media/"):
        path = "static/" + path[len("/api/media/"):]
    elif path.startswith("api/media/"):
        path = "static/" + path[len("api/media/"):]

    # If path contains "static/" somewhere in the middle (absolute path), extract from there
    idx = path.find("static/")
    if idx > 0:
        path = path[idx:]  # e.g. "static/results/uuid/left_gradcam_overlay.jpg"

    # Strip leading slash from /static/...
    if path.startswith("/"):
        path = path.lstrip("/")

    # Resolve relative to backend root directory so it works regardless of CWD
    if not os.path.isabs(path):
        abs_path = os.path.join(_BACKEND_ROOT, path)
    else:
        abs_path = path

    if not os.path.exists(abs_path):
        # Also check relative to config settings.STATIC_DIR
        try:
            from config import settings
            sub = path[len("static/"):] if path.startswith("static/") else path
            cand = os.path.join(settings.STATIC_DIR, sub)
            if os.path.exists(cand):
                abs_path = cand
        except Exception:
            pass

    if not os.path.exists(abs_path):
        return None
    try:
        img = RLImage(abs_path, width=width_cm * cm, height=height_cm * cm)
        return img
    except Exception:
        return None


def placeholder_cell(label: str, w_cm: float, h_cm: float):
    """Return a small table cell used when an image is absent."""
    data = [[Paragraph(f'<font color="#6c7b7e" size="7">{label}</font>',
                       ParagraphStyle('ph', alignment=TA_CENTER))]]
    t = Table(data, colWidths=[w_cm * cm], rowHeights=[h_cm * cm])
    t.setStyle(TableStyle([
        ('BOX',       (0, 0), (-1, -1), 0.5, LINE),
        ('BACKGROUND',(0, 0), (-1, -1), BG),
        ('VALIGN',    (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN',     (0, 0), (-1, -1), 'CENTER'),
    ]))
    return t


# ─── Style helpers ──────────────────────────────────────────────────────────
def _styles():
    base = getSampleStyleSheet()

    def add(name, **kw):
        base.add(ParagraphStyle(name=name, **kw))

    add("RTitle",
        fontName="Helvetica-Bold", fontSize=22, textColor=TEAL_DARK,
        spaceAfter=2, alignment=TA_LEFT)
    add("RSubtitle",
        fontName="Helvetica", fontSize=9, textColor=MUTED,
        spaceAfter=4, alignment=TA_LEFT)
    add("REyebrow",
        fontName="Helvetica-Bold", fontSize=7, textColor=TEAL,
        spaceAfter=2, letterSpacing=1.5, alignment=TA_LEFT)
    add("RSection",
        fontName="Helvetica-Bold", fontSize=12, textColor=BLACK,
        spaceBefore=8, spaceAfter=4, leading=16)
    add("RSubSection",
        fontName="Helvetica-Bold", fontSize=10, textColor=TEAL_DARK,
        spaceBefore=4, spaceAfter=3, leading=13)
    add("RBody",
        fontName="Helvetica", fontSize=8.5, textColor=BLACK,
        spaceAfter=2, leading=13)
    add("RMuted",
        fontName="Helvetica", fontSize=7.5, textColor=MUTED,
        spaceAfter=2, leading=12)
    add("RGradeGood",
        fontName="Helvetica-Bold", fontSize=13, textColor=GOOD,
        spaceAfter=1, leading=16)
    add("RGradeWarn",
        fontName="Helvetica-Bold", fontSize=13, textColor=WARN,
        spaceAfter=1, leading=16)
    add("RGradeDanger",
        fontName="Helvetica-Bold", fontSize=13, textColor=DANGER,
        spaceAfter=1, leading=16)
    add("RDisclaimer",
        fontName="Helvetica-Oblique", fontSize=7, textColor=MUTED,
        spaceAfter=2, leading=11)
    add("RCenter",
        fontName="Helvetica", fontSize=8.5, textColor=BLACK,
        alignment=TA_CENTER, leading=13)
    add("RImageLabel",
        fontName="Helvetica-Bold", fontSize=7.5, textColor=TEAL,
        alignment=TA_CENTER, spaceAfter=1, leading=10)
    return base


# ─── Table style helper ─────────────────────────────────────────────────────
def simple_table(data, col_widths, header=True):
    t = Table(data, colWidths=col_widths)
    cmds = [
        ('FONTNAME',   (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE',   (0, 0), (-1, -1), 8),
        ('TEXTCOLOR',  (0, 0), (-1, -1), BLACK),
        ('VALIGN',     (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, BG]),
        ('LINEBELOW',  (0, 0), (-1, -1), 0.25, LINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',(0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 4),
    ]
    if header:
        cmds += [
            ('BACKGROUND', (0, 0), (-1, 0), TEAL_DARK),
            ('TEXTCOLOR',  (0, 0), (-1, 0), colors.white),
            ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
        ]
    t.setStyle(TableStyle(cmds))
    return t


def key_val_table(rows, col_widths):
    """Two-column label / value table (no header row)."""
    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('FONTNAME',   (0, 0), (-1, -1), 'Helvetica'),
        ('FONTNAME',   (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE',   (0, 0), (-1, -1), 8),
        ('TEXTCOLOR',  (0, 0), (0, -1), MUTED),
        ('TEXTCOLOR',  (1, 0), (-1, -1), BLACK),
        ('VALIGN',     (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW',  (0, 0), (-1, -1), 0.25, LINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING',(0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 3),
    ]))
    return t


def section_header(title: str, styles) -> Table:
    """Colored section heading bar."""
    data = [[Paragraph(title, styles['RSection'])]]
    t = Table(data, colWidths=[PAGE_W - 2 * MARGIN])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), TEAL_LIGHT),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING',  (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 5),
        ('BOX',         (0, 0), (-1, -1), 0.5, TEAL),
    ]))
    return t


# ─── Probability bar (inline HTML-ish using a mini table) ───────────────────
def prob_bars(probs, styles):
    """Returns a Table representing a horizontal bar chart of DR class probs."""
    labels = ["Grade 0 — No DR", "Grade 1 — Mild", "Grade 2 — Moderate",
              "Grade 3 — Severe", "Grade 4 — Proliferative"]
    bar_colors = [GOOD, GOOD, WARN, DANGER, DANGER]
    rows = []
    full_w = 80 * mm

    for i, (lbl, p, bc) in enumerate(zip(labels, probs, bar_colors)):
        bar_w = max(1, full_w * p)
        bar_cell_data = [["" ]]
        bar_t = Table(bar_cell_data, colWidths=[bar_w], rowHeights=[5 * mm])
        bar_t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), bc),
            ('BOX',        (0,0), (-1,-1), 0, colors.white),
        ]))
        pct_str = f"{p*100:.1f}%"
        row = [
            Paragraph(lbl,   ParagraphStyle('pl', fontName='Helvetica', fontSize=7.5, textColor=BLACK)),
            bar_t,
            Paragraph(pct_str, ParagraphStyle('pr', fontName='Helvetica-Bold', fontSize=7.5, textColor=BLACK, alignment=TA_RIGHT)),
        ]
        rows.append(row)

    t = Table(rows, colWidths=[45*mm, full_w, 16*mm],
              rowHeights=[7*mm] * len(rows))
    t.setStyle(TableStyle([
        ('VALIGN',   (0,0), (-1,-1), 'MIDDLE'),
        ('LINEBELOW',(0,0), (-1,-1), 0.25, LINE),
        ('LEFTPADDING',(0,0), (-1,-1), 2),
        ('RIGHTPADDING',(0,0), (-1,-1), 2),
        ('TOPPADDING',(0,0), (-1,-1), 1),
        ('BOTTOMPADDING',(0,0), (-1,-1), 1),
    ]))
    return t


# ─── Image evidence grid ────────────────────────────────────────────────────
def eye_image_grid(screening, eye: str, styles) -> Table:
    """
    Returns a 2×2 grid of images:
      [Original fundus]   [Grad-CAM overlay]
      [Vessel overlay]    [OD + Fovea overlay]
    """
    W, H = 7.0, 5.8   # cm per image cell

    def img_cell(path, label):
        img = safe_img(path, W, H)
        content = img if img else placeholder_cell("Image unavailable", W, H)
        lbl = Paragraph(label, styles['RImageLabel'])
        data = [[lbl], [content]]
        t = Table(data, colWidths=[W*cm])
        t.setStyle(TableStyle([
            ('ALIGN',   (0,0), (-1,-1), 'CENTER'),
            ('VALIGN',  (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING',(0,0), (-1,-1), 2),
            ('BOTTOMPADDING',(0,0), (-1,-1), 2),
            ('LEFTPADDING',(0,0), (-1,-1), 2),
            ('RIGHTPADDING',(0,0), (-1,-1), 2),
        ]))
        return t

    orig_path  = getattr(screening, f"{eye}_image_path", None)
    gcam_path  = getattr(screening, f"{eye}_gradcam_path", None)
    vessel_path= getattr(screening, f"{eye}_vessel_overlay_path", None)
    odf_path   = getattr(screening, f"{eye}_od_fovea_overlay_path", None)
    vessel_den = getattr(screening, f"{eye}_vessel_density", None)

    vessel_lbl = "Vessel Segmentation"
    if vessel_den is not None:
        vessel_lbl += f" (Density: {vessel_den*100:.1f}%)"

    grid_data = [
        [img_cell(orig_path,   "Original Fundus"),
         img_cell(gcam_path,   "Grad-CAM Attention")],
        [img_cell(vessel_path, vessel_lbl),
         img_cell(odf_path,    "Optic Disc + Fovea")],
    ]
    grid = Table(grid_data, colWidths=[W*cm, W*cm], rowHeights=[(H+1.4)*cm, (H+1.4)*cm])
    grid.setStyle(TableStyle([
        ('ALIGN',   (0,0), (-1,-1), 'CENTER'),
        ('VALIGN',  (0,0), (-1,-1), 'TOP'),
        ('GRID',    (0,0), (-1,-1), 0.5, LINE),
        ('BACKGROUND',(0,0), (-1,-1), colors.white),
    ]))
    return grid


# ─── Eye result card ─────────────────────────────────────────────────────────
def eye_result_block(screening, eye: str, styles):
    """Returns a small card-style table showing grade + confidence."""
    grade = getattr(screening, f"{eye}_dr_grade", None)
    conf_r = getattr(screening, f"{eye}_confidence_raw", None)
    conf_c = getattr(screening, f"{eye}_confidence_calibrated", None)
    referable = getattr(screening, f"{eye}_referable", None)
    status = getattr(screening, f"{eye}_quality_status", "N/A")

    try:
        if hasattr(screening, 'reviews') and screening.reviews:
            rev = screening.reviews[0]
            if rev.decision == 'modified':
                rgrade = getattr(rev, f"final_grade_{eye}", None)
                if rgrade is not None:
                    grade = rgrade
                    referable = (rgrade >= 2)
    except Exception:
        pass

    if grade is None:
        gname = "Not analysed"
        gc = MUTED
        grade_str = "—"
        ref_str = "—"
        ref_color = MUTED
        ref_bg = colors.white
    else:
        gname = GRADE_NAMES.get(grade, "")
        gc = grade_color(grade)
        grade_str = f"Grade {grade}"
        ref_str = "REFERABLE" if referable else "NON-REFERABLE"
        ref_color = DANGER if referable else GOOD
        ref_bg = DANGER_LIGHT if referable else GOOD_LIGHT

    data = [
        [Paragraph(eye.upper() + " EYE",
                   ParagraphStyle('elbl', fontName='Helvetica-Bold', fontSize=7,
                                  textColor=colors.white, alignment=TA_CENTER))],
        [Paragraph(f'<font color="{_chex(gc)}"><b>{grade_str}</b></font><br/>'
                   f'<font size="9">{gname}</font>',
                   ParagraphStyle('eg', fontName='Helvetica', fontSize=11,
                                  alignment=TA_CENTER, leading=15))],
        [Paragraph(f'<b>{ref_str}</b>',
                   ParagraphStyle('eref', fontName='Helvetica-Bold', fontSize=8,
                                  textColor=ref_color, alignment=TA_CENTER))],
        [Paragraph(f'Image Quality: <b>{status.capitalize() if status else "N/A"}</b>',
                   ParagraphStyle('equal', fontName='Helvetica', fontSize=7.5,
                                  textColor=MUTED, alignment=TA_CENTER))],
    ]
    col_w = (PAGE_W - 2*MARGIN) / 2 - 4*mm
    t = Table(data, colWidths=[col_w],
              rowHeights=[8*mm, 20*mm, 8*mm, 8*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), TEAL_DARK),
        ('BACKGROUND', (0,2), (-1,2), ref_bg),
        ('ALIGN',      (0,0), (-1,-1), 'CENTER'),
        ('VALIGN',     (0,0), (-1,-1), 'MIDDLE'),
        ('BOX',        (0,0), (-1,-1), 0.5, TEAL),
        ('LINEBELOW',  (0,0), (-1,-1), 0.25, LINE),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING',(0,0), (-1,-1), 3),
    ]))
    return t


# ─── Lesion analysis section helper ──────────────────────────────────────────
def lesion_analysis_block(screening, eye: str, lesion_data, styles, full_w: float):
    """
    Builds a clinical Lesion Analysis card:
      - Left: High-resolution Lesion Segmentation Overlay image + color legend
      - Right: Quantitative pathology metrics table + clinical burden / macular risk card
    """
    if not lesion_data:
        return None
    if isinstance(lesion_data, str):
        try:
            lesion_data = json.loads(lesion_data)
        except Exception:
            return None
    if not isinstance(lesion_data, dict):
        return None

    eye_cap = eye.capitalize()

    # 1. Overlay image path resolution
    overlay_path = lesion_data.get("overlay_url")
    if not overlay_path:
        scr_id = getattr(screening, "screening_display_id", "")
        cand = f"static/results/{scr_id}/{eye.lower()}_lesion_overlay.jpg"
        if os.path.exists(os.path.join(_BACKEND_ROOT, cand)):
            overlay_path = cand

    # 2. Lesion pathology categories with map color associations matching AI model
    cats = [
        ("microaneurysm", "Microaneurysms", "#2563eb", "Blue"),
        ("hemorrhage", "Intraretinal Hemorrhages", "#ea580c", "Orange"),
        ("exudate", "Hard Exudates", "#ca8a04", "Yellow"),
        ("neovascularization", "Neovascularization", "#0d9488", "Clear"),
    ]

    table_rows = [["Lesion Type", "Map Color", "Status", "Count"]]
    total_count = 0
    exudates_detected = False

    for key, label, color_hex, color_name in cats:
        cat = lesion_data.get(key, {})
        detected = cat.get("detected", False)
        count_val = cat.get("count", None)

        color_col = Paragraph(f'<font color="{color_hex}"><b>{color_name}</b></font>', styles['RBody'])

        if detected:
            cnt = int(count_val) if count_val is not None and str(count_val).isdigit() else 1
            total_count += cnt
            if key == "exudate":
                exudates_detected = True
            status_p = Paragraph(f'<b><font color="{color_hex}">Detected</font></b>', styles['RBody'])
            count_txt = str(cnt)
        else:
            status_p = Paragraph('<font color="#6c7b7e">Not detected</font>', styles['RBody'])
            count_txt = "0"

        table_rows.append([label, color_col, status_p, count_txt])

    # Right column widths: 40mm + 24mm + 22mm + 16mm = 102mm
    col_w = [40*mm, 24*mm, 22*mm, 16*mm]
    les_tbl = simple_table(table_rows, col_w, header=True)

    # Clinical burden & advisory callout
    if total_count > 0:
        if total_count > 25:
            burden_lvl = "High microvascular lesion load"
            b_color = DANGER
            b_bg = DANGER_LIGHT
        elif total_count >= 5:
            burden_lvl = "Moderate microvascular lesion load"
            b_color = WARN
            b_bg = WARN_LIGHT
        else:
            burden_lvl = "Mild microvascular lesion load"
            b_color = GOOD
            b_bg = GOOD_LIGHT

        dme_alert = ""
        if exudates_detected:
            dme_alert = "<br/>• <b>Macular Advisory:</b> Hard exudates present — evaluate foveal proximity for DME risk."

        callout_html = (
            f'<b><font color="{_chex(b_color)}">● {burden_lvl}</font></b><br/>'
            f'<font size="7.5" color="#142426">Total <b>{total_count}</b> focal lesions quantified via 5-fold ensemble.{dme_alert}</font>'
        )
    else:
        b_color = GOOD
        b_bg = GOOD_LIGHT
        callout_html = '<font size="7.5" color="#1d735c"><b>✓ No significant microvascular lesions detected</b> above segmentation threshold.</font>'

    callout_p = Paragraph(callout_html, ParagraphStyle('lcall', fontName='Helvetica', fontSize=7.5, leading=11))
    callout_t = Table([[callout_p]], colWidths=[102*mm])
    callout_t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), b_bg),
        ('BOX',        (0,0), (-1,-1), 0.5, b_color),
        ('LEFTPADDING', (0,0), (-1,-1), 7),
        ('RIGHTPADDING',(0,0), (-1,-1), 7),
        ('TOPPADDING',  (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0), (-1,-1), 5),
    ]))

    right_col = Table([[les_tbl], [Spacer(1, 2*mm)], [callout_t]], colWidths=[102*mm])
    right_col.setStyle(TableStyle([
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING',(0,0), (-1,-1), 0),
        ('TOPPADDING',  (0,0), (-1,-1), 0),
        ('BOTTOMPADDING',(0,0), (-1,-1), 0),
    ]))

    # Check if lesion overlay image can be loaded
    img_obj = safe_img(overlay_path, 6.6, 5.2) if overlay_path else None
    if img_obj:
        img_lbl = Paragraph(f"<b>{eye_cap} Eye · Lesion Overlay</b>", styles['RImageLabel'])
        legend_html = (
            '<font size="6.5" color="#142426">'
            '<b>Key:</b> &nbsp;'
            '<font color="#2563eb">■</font> Microaneurysms &nbsp; '
            '<font color="#ea580c">■</font> Hemorrhages &nbsp; '
            '<font color="#ca8a04">■</font> Exudates'
            '</font>'
        )
        legend_p = Paragraph(legend_html, ParagraphStyle('lleg', fontName='Helvetica', fontSize=6.5, alignment=TA_CENTER, leading=9))
        left_box = Table([[img_lbl], [img_obj], [Spacer(1, 1*mm)], [legend_p]], colWidths=[68*mm])
        left_box.setStyle(TableStyle([
            ('ALIGN',   (0,0), (-1,-1), 'CENTER'),
            ('VALIGN',  (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 2),
            ('RIGHTPADDING',(0,0), (-1,-1), 2),
            ('TOPPADDING',  (0,0), (-1,-1), 2),
            ('BOTTOMPADDING',(0,0), (-1,-1), 2),
        ]))

        combined = Table([[left_box, right_col]], colWidths=[70*mm, 104*mm])
        combined.setStyle(TableStyle([
            ('VALIGN',  (0,0), (-1,-1), 'TOP'),
            ('BOX',     (0,0), (-1,-1), 0.5, LINE),
            ('BACKGROUND',(0,0), (-1,-1), colors.white),
            ('LEFTPADDING', (0,0), (-1,-1), 4),
            ('RIGHTPADDING',(0,0), (-1,-1), 4),
            ('TOPPADDING',  (0,0), (-1,-1), 4),
            ('BOTTOMPADDING',(0,0), (-1,-1), 4),
        ]))
        return combined
    else:
        # Fallback if image not generated or unavailable: full width table
        single_t = Table([[les_tbl], [Spacer(1, 2*mm)], [callout_t]], colWidths=[full_w])
        single_t.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOX',    (0,0), (-1,-1), 0.5, LINE),
            ('BACKGROUND',(0,0), (-1,-1), colors.white),
            ('LEFTPADDING', (0,0), (-1,-1), 4),
            ('RIGHTPADDING',(0,0), (-1,-1), 4),
            ('TOPPADDING',  (0,0), (-1,-1), 4),
            ('BOTTOMPADDING',(0,0), (-1,-1), 4),
        ]))
        return single_t


def biomarkers_table_block(screening, styles, full_w: float):
    """
    Construct a compact conditional table for retinal vascular biomarkers.
    Returns None if neither eye has computed biomarker data.
    """
    def _extract_bio(eye_prefix):
        raw = getattr(screening, f"{eye_prefix}_biomarkers", None)
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = None
        if not raw or not isinstance(raw, dict):
            avr = getattr(screening, f"{eye_prefix}_avr", None)
            tort = getattr(screening, f"{eye_prefix}_tortuosity", None)
            df = getattr(screening, f"{eye_prefix}_fractal_dim", None)
            if avr is not None or df is not None:
                return {
                    "avr": avr,
                    "mean_tortuosity_distance": tort,
                    "fractal_dimension": df,
                    "status": "completed"
                }
            return None
        if raw.get("status") == "skipped":
            return None
        return raw

    left_b = _extract_bio("left")
    right_b = _extract_bio("right")

    has_any = False
    for b in (left_b, right_b):
        if b and (b.get("avr") is not None or b.get("fractal_dimension") is not None or b.get("mean_tortuosity_distance") is not None):
            has_any = True
            break

    if not has_any:
        return None

    def _val(b, key, fmt="{:.4f}"):
        if not b:
            return "—"
        v = b.get(key)
        if v is None:
            return "—"
        try:
            return fmt.format(float(v))
        except (ValueError, TypeError):
            return str(v)

    def _calibers(b):
        if not b:
            return "—"
        crae = b.get("crae_pixels")
        crve = b.get("crve_pixels")
        if crae is not None and crve is not None:
            return f"{float(crae):.1f} / {float(crve):.1f} px"
        return "—"

    def _fractal(b):
        if not b:
            return "—"
        df = b.get("fractal_dimension")
        r2 = b.get("fractal_r_squared")
        if df is not None:
            res = f"{float(df):.4f}"
            if r2 is not None:
                res += f" (R²={float(r2):.3f})"
            return res
        return "—"

    def _topology(b):
        if not b:
            return "—"
        zb = b.get("zone_b_count")
        br = b.get("branch_count")
        if zb is not None or br is not None:
            parts = []
            if zb is not None:
                parts.append(f"{zb} zb")
            if br is not None:
                parts.append(f"{br} br")
            return ", ".join(parts)
        return "—"

    rows = [
        [
            Paragraph("<b>Morphometric Parameter</b>", styles['RBody']),
            Paragraph("<b>Left Eye (OS)</b>", styles['RBody']),
            Paragraph("<b>Right Eye (OD)</b>", styles['RBody']),
            Paragraph("<b>Method / Reference</b>", styles['RBody']),
        ],
        [
            Paragraph("<b>Arteriolar-to-Venular Ratio (AVR)</b>", styles['RBody']),
            Paragraph(_val(left_b, "avr", "{:.4f}"), styles['RBody']),
            Paragraph(_val(right_b, "avr", "{:.4f}"), styles['RBody']),
            Paragraph("Parr-Hubbard-Knudtson (Zone B Heuristic)", styles['RMuted']),
        ],
        [
            Paragraph("<b>CRAE / CRVE Calibers</b>", styles['RBody']),
            Paragraph(_calibers(left_b), styles['RBody']),
            Paragraph(_calibers(right_b), styles['RBody']),
            Paragraph("Central Retinal Equivalents (px)", styles['RMuted']),
        ],
        [
            Paragraph("<b>Mean Distance Tortuosity (τ<sub>d</sub>)</b>", styles['RBody']),
            Paragraph(_val(left_b, "mean_tortuosity_distance", "{:.4f}"), styles['RBody']),
            Paragraph(_val(right_b, "mean_tortuosity_distance", "{:.4f}"), styles['RBody']),
            Paragraph("Arc / Chord - 1 (Skeleton branches)", styles['RMuted']),
        ],
        [
            Paragraph("<b>Curvature Tortuosity (τ<sub>c</sub>)</b>", styles['RBody']),
            Paragraph(_val(left_b, "mean_tortuosity_curvature", "{:.4f}"), styles['RBody']),
            Paragraph(_val(right_b, "mean_tortuosity_curvature", "{:.4f}"), styles['RBody']),
            Paragraph("Mean angular deviation / arc length", styles['RMuted']),
        ],
        [
            Paragraph("<b>Fractal Dimension (D<sub>f</sub>)</b>", styles['RBody']),
            Paragraph(_fractal(left_b), styles['RBody']),
            Paragraph(_fractal(right_b), styles['RBody']),
            Paragraph("Box-Counting complexity & R² fit", styles['RMuted']),
        ],
        [
            Paragraph("<b>Branching Topology</b>", styles['RBody']),
            Paragraph(_topology(left_b), styles['RBody']),
            Paragraph(_topology(right_b), styles['RBody']),
            Paragraph("Zone-B vessels / Bifurcations", styles['RMuted']),
        ],
    ]

    col1 = 48 * mm
    col2 = 28 * mm
    col3 = 28 * mm
    col4 = full_w - (col1 + col2 + col3)
    table = simple_table(rows, [col1, col2, col3, col4], header=True)
    return table


# ─── Main report generator ──────────────────────────────────────────────────
class ReportService:

    def generate_report_to_buffer(self, screening, patient, buffer: io.BytesIO) -> io.BytesIO:
        """
        Generate a professional A4 PDF report into an in-memory BytesIO buffer.
        Preferred method for Supabase Storage upload — no permanent local disk writes.

        Internally writes to a temp file (via generate_report) and reads it back
        into buffer, so all report-building logic stays in one place.

        Args:
            screening: SQLAlchemy Screening ORM object
            patient:   SQLAlchemy Patient ORM object
            buffer:    BytesIO to write the PDF into
        Returns:
            The same buffer, seeked to position 0, ready for reading/upload.
        """
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            self.generate_report(screening, patient, tmp_path)
            with open(tmp_path, "rb") as f:
                buffer.write(f.read())
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        buffer.seek(0)
        return buffer

    def generate_report(self, screening, patient, output_path: str) -> str:
        """
        Generate a professional A4 PDF report and save to disk.
        Args:
            screening: SQLAlchemy Screening ORM object
            patient: SQLAlchemy Patient ORM object
            output_path: absolute path to save the PDF
        Returns:
            output_path on success
        """
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            leftMargin=MARGIN,
            rightMargin=MARGIN,
            topMargin=MARGIN,
            bottomMargin=MARGIN,
        )
        styles = _styles()
        story = []
        full_w = PAGE_W - 2 * MARGIN

        # ── HEADER ──────────────────────────────────────────────────────────
        header_data = [[
            Paragraph(
                '<b>RetinaAI</b>',
                ParagraphStyle('hbrand', fontName='Helvetica-Bold', fontSize=20,
                               textColor=colors.white)
            ),
            Paragraph(
                f'SCREENING REPORT<br/>'
                f'<font size="8">{screening.screening_display_id} &nbsp;·&nbsp; '
                f'{screening.created_at.strftime("%d %b %Y, %H:%M")}</font>',
                ParagraphStyle('hmeta', fontName='Helvetica-Bold', fontSize=11,
                               textColor=colors.white, alignment=TA_RIGHT)
            ),
        ]]
        header_t = Table(header_data, colWidths=[full_w * 0.5, full_w * 0.5], rowHeights=[18*mm])
        header_t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), TEAL_DARK),
            ('VALIGN',     (0,0), (-1,-1), 'MIDDLE'),
            ('LEFTPADDING',(0,0), (-1,-1), 10),
            ('RIGHTPADDING',(0,0), (-1,-1), 10),
        ]))
        story.append(header_t)
        story.append(Spacer(1, 5*mm))

        # ── PATIENT INFO ────────────────────────────────────────────────────
        story.append(section_header("Patient Information", styles))
        story.append(Spacer(1, 2*mm))

        pat_rows = [
            ["Patient ID",    patient.patient_display_id,
             "Name",          patient.name],
            ["Age / Sex",     f"{patient.age} yrs / {patient.sex}",
             "Diabetes",      f"{patient.diabetes_duration} years duration"],
            ["Previous DR",   patient.previous_dr or "—",
             "HbA1c",         patient.hba1c or "—"],
            ["Prev. Screening",patient.previous_screening.strftime("%d %b %Y") if patient.previous_screening else "—",
             "Screening Date", screening.created_at.strftime("%d %b %Y")],
        ]
        cw = full_w / 4
        pat_t = Table(pat_rows, colWidths=[cw*0.7, cw*1.3, cw*0.7, cw*1.3])
        pat_t.setStyle(TableStyle([
            ('FONTNAME',   (0,0), (-1,-1), 'Helvetica'),
            ('FONTNAME',   (0,0), (0,-1), 'Helvetica-Bold'),
            ('FONTNAME',   (2,0), (2,-1), 'Helvetica-Bold'),
            ('FONTSIZE',   (0,0), (-1,-1), 8),
            ('TEXTCOLOR',  (0,0), (0,-1), MUTED),
            ('TEXTCOLOR',  (2,0), (2,-1), MUTED),
            ('TEXTCOLOR',  (1,0), (1,-1), BLACK),
            ('TEXTCOLOR',  (3,0), (3,-1), BLACK),
            ('LINEBELOW',  (0,0), (-1,-1), 0.25, LINE),
            ('BACKGROUND', (0,0), (-1,-1), colors.white),
            ('ROWBACKGROUNDS', (0,0), (-1,-1), [colors.white, BG]),
            ('LEFTPADDING', (0,0), (-1,-1), 5),
            ('TOPPADDING',  (0,0), (-1,-1), 4),
            ('BOTTOMPADDING',(0,0), (-1,-1), 4),
        ]))
        story.append(pat_t)
        story.append(Spacer(1, 5*mm))

        # ── IMAGE QUALITY ───────────────────────────────────────────────────
        story.append(section_header("Image Quality Assessment", styles))
        story.append(Spacer(1, 2*mm))

        def quality_row(eye_label, q_status, q_scores):
            if not q_status:
                return [eye_label, "—", "—", "—", "—", "—", "—"]
            s = q_scores or {}
            status_txt = q_status.upper()
            enhanced_txt = "Yes" if getattr(screening, f"{eye_label.lower()}_enhanced", False) else "No"
            return [
                eye_label,
                status_txt,
                f"{s.get('focus', 0):.0f}",
                f"{s.get('brightness', 0):.0f}",
                f"{s.get('contrast', 0):.0f}",
                f"{s.get('fov', 0):.0f}",
                enhanced_txt,
            ]

        import json
        def _scores(eye):
            raw = getattr(screening, f"{eye}_quality_scores", None)
            if not raw:
                return {}
            if isinstance(raw, dict):
                return raw
            try:
                return json.loads(raw)
            except Exception:
                return {}

        qual_data = [
            ["Eye", "Status", "Focus", "Brightness", "Contrast", "FOV", "Enhanced"],
            quality_row("Left",  getattr(screening, "left_quality_status", None),  _scores("left")),
            quality_row("Right", getattr(screening, "right_quality_status", None), _scores("right")),
        ]
        cws = [20*mm, 25*mm, 22*mm, 25*mm, 22*mm, 20*mm, 22*mm]
        story.append(simple_table(qual_data, cws, header=True))
        story.append(Spacer(1, 5*mm))

        # ── AI RESULTS — side-by-side ────────────────────────────────────────
        story.append(section_header("AI Screening Results", styles))
        story.append(Spacer(1, 2*mm))

        left_card  = eye_result_block(screening, "left",  styles)
        right_card = eye_result_block(screening, "right", styles)

        dual_card = Table([[left_card, right_card]],
                          colWidths=[(full_w/2 - 2*mm), (full_w/2 - 2*mm)],
                          rowHeights=None)
        dual_card.setStyle(TableStyle([
            ('ALIGN',   (0,0), (-1,-1), 'CENTER'),
            ('VALIGN',  (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING',(0,0), (-1,-1), 2),
            ('RIGHTPADDING',(0,0), (-1,-1), 2),
        ]))
        story.append(dual_card)
        story.append(Spacer(1, 4*mm))

        # Probability bars (left eye)
        left_probs = getattr(screening, "left_class_probabilities", None)
        if left_probs:
            if isinstance(left_probs, str):
                try:
                    left_probs = json.loads(left_probs)
                except Exception:
                    left_probs = None
        if left_probs:
            story.append(Paragraph("Left Eye — Grade Probability Distribution", styles['RSubSection']))
            story.append(prob_bars(left_probs, styles))
            story.append(Spacer(1, 2*mm))

        right_probs = getattr(screening, "right_class_probabilities", None)
        if right_probs:
            if isinstance(right_probs, str):
                try:
                    right_probs = json.loads(right_probs)
                except Exception:
                    right_probs = None
        if right_probs:
            story.append(Paragraph("Right Eye — Grade Probability Distribution", styles['RSubSection']))
            story.append(prob_bars(right_probs, styles))
            story.append(Spacer(1, 3*mm))

        # ── VISUAL EVIDENCE ──────────────────────────────────────────────────
        story.append(section_header("Visual Evidence", styles))
        story.append(Spacer(1, 2*mm))

        # Left eye images
        left_status = getattr(screening, "left_quality_status", None)
        if left_status and left_status != "ungradable":
            story.append(Paragraph("Left Eye — Retinal Analysis", styles['RSubSection']))
            story.append(eye_image_grid(screening, "left", styles))
            story.append(Spacer(1, 4*mm))

        # Right eye images
        right_status = getattr(screening, "right_quality_status", None)
        if right_status and right_status != "ungradable":
            story.append(Paragraph("Right Eye — Retinal Analysis", styles['RSubSection']))
            story.append(eye_image_grid(screening, "right", styles))
            story.append(Spacer(1, 4*mm))

        # ── LESION ANALYSIS & PATHOLOGY ──────────────────────────────────────
        story.append(section_header("Lesion Analysis & Microvascular Pathology", styles))
        story.append(Spacer(1, 2*mm))

        left_lesion  = getattr(screening, "left_lesion_result",  None)
        right_lesion = getattr(screening, "right_lesion_result", None)

        rendered_any_lesion = False

        if left_lesion:
            left_block = lesion_analysis_block(screening, "left", left_lesion, styles, full_w)
            if left_block:
                story.append(Paragraph("Left Eye — Microvascular Lesion Breakdown", styles['RSubSection']))
                story.append(left_block)
                story.append(Spacer(1, 3*mm))
                rendered_any_lesion = True

        if right_lesion:
            right_block = lesion_analysis_block(screening, "right", right_lesion, styles, full_w)
            if right_block:
                story.append(Paragraph("Right Eye — Microvascular Lesion Breakdown", styles['RSubSection']))
                story.append(right_block)
                story.append(Spacer(1, 3*mm))
                rendered_any_lesion = True

        if not rendered_any_lesion:
            note_data = [[
                Paragraph(
                    'ℹ️  <b>No lesion segmentation data available for this screening.</b><br/>'
                    'Lesion segmentation is executed during active analysis when fundus quality meets gradability criteria.',
                    ParagraphStyle('lnote', fontName='Helvetica', fontSize=8.5,
                                   textColor=MUTED, leading=13)
                )
            ]]
            note_t = Table(note_data, colWidths=[full_w])
            note_t.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), BG),
                ('BOX',        (0,0), (-1,-1), 0.5, LINE),
                ('LEFTPADDING', (0,0), (-1,-1), 10),
                ('TOPPADDING',  (0,0), (-1,-1), 8),
                ('BOTTOMPADDING',(0,0), (-1,-1), 8),
            ]))
            story.append(note_t)

        story.append(Spacer(1, 4*mm))

        # ── RETINAL VASCULAR BIOMARKERS (CONDITIONAL) ────────────────────────
        bio_table = biomarkers_table_block(screening, styles, full_w)
        if bio_table:
            story.append(section_header("Retinal Vascular Biomarkers — Research / Exploratory Morphometry", styles))
            story.append(Spacer(1, 2*mm))
            story.append(bio_table)
            story.append(Spacer(1, 2*mm))
            disclaimer_text = (
                "* Retinal microvascular biomarkers (AVR, tortuosity, fractal dimension) are computed algorithmically "
                "via MATLAB Engine morphometry and heuristics. They are intended for investigative research and do "
                "not constitute standalone clinically validated diagnostic measurements."
            )
            story.append(Paragraph(disclaimer_text, styles['RDisclaimer']))
            story.append(Spacer(1, 4*mm))

        # ── REFERRAL RECOMMENDATION ──────────────────────────────────────────
        story.append(section_header("Referral Recommendation", styles))
        story.append(Spacer(1, 2*mm))

        referable = getattr(screening, "overall_referable", None)
        try:
            if hasattr(screening, 'reviews') and screening.reviews:
                rev = screening.reviews[0]
                if rev.decision == 'modified' and rev.final_referable is not None:
                    referable = rev.final_referable
        except Exception:
            pass

        rec_text  = getattr(screening, "recommendation", "No recommendation recorded.")
        if referable:
            rec_text = "Patient requires immediate referral to an ophthalmologist for detailed clinical evaluation and management."
        elif referable is False:
            rec_text = "Routine annual screening recommended. No immediate referral indicated."

        rec_bg    = DANGER_LIGHT if referable else GOOD_LIGHT
        rec_border= DANGER       if referable else GOOD
        rec_icon  = "⚠ PRIORITY REFERRAL" if referable else "✓ ROUTINE FOLLOW-UP"
        if referable is None:
            rec_icon = "— NOT FULLY ANALYSED"
            rec_bg = colors.white
            rec_border = MUTED
        rec_color = DANGER if referable else GOOD

        rec_data = [[
            Paragraph(
                f'<b><font color="{_chex(rec_color)}">{rec_icon}</font></b><br/>'
                f'<font size="8.5">{rec_text}</font>',
                ParagraphStyle('recblock', fontName='Helvetica', fontSize=10,
                               leading=14, spaceAfter=2)
            )
        ]]
        rec_t = Table(rec_data, colWidths=[full_w])
        rec_t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), rec_bg),
            ('BOX',        (0,0), (-1,-1), 1.0, rec_border),
            ('LEFTPADDING', (0,0), (-1,-1), 12),
            ('TOPPADDING',  (0,0), (-1,-1), 10),
            ('BOTTOMPADDING',(0,0), (-1,-1), 10),
        ]))
        story.append(rec_t)
        story.append(Spacer(1, 5*mm))

        # ── HUMAN REVIEW ─────────────────────────────────────────────────────
        from database.models import Review
        # The relationship is `reviews` (list), not `review`
        review = None
        try:
            if hasattr(screening, 'reviews') and screening.reviews:
                review = screening.reviews[0]
        except Exception:
            pass

        if review:
            story.append(section_header("Ophthalmologist Review", styles))
            story.append(Spacer(1, 2*mm))

            decision_map = {
                "confirmed": ("✓ AI Result Confirmed", GOOD, GOOD_LIGHT),
                "modified":  ("✎ Assessment Modified", WARN, WARN_LIGHT),
                "flagged":   ("⚑ Flagged for Further Review", DANGER, DANGER_LIGHT),
            }
            dec_label, dec_color, dec_bg = decision_map.get(
                review.decision, (review.decision, MUTED, BG))

            rev_rows = [
                ["Reviewer",   review.reviewer.full_name if hasattr(review, 'reviewer') and review.reviewer else "—"],
                ["Decision",   dec_label],
                ["Final Grade (L/R)",
                 f"Grade {review.final_grade_left} / Grade {review.final_grade_right}"
                 if review.final_grade_left is not None else "Unchanged"],
                ["Final Referral",
                 "Referable" if review.final_referable else "Non-referable"
                 if review.final_referable is not None else "Unchanged"],
                ["Notes",      review.notes or "—"],
                ["Reviewed at", review.reviewed_at.strftime("%d %b %Y, %H:%M")],
            ]
            story.append(key_val_table(rev_rows, [45*mm, full_w - 45*mm]))
            story.append(Spacer(1, 3*mm))

        # ── PIPELINE STATS ────────────────────────────────────────────────────
        pipeline_time = getattr(screening, "pipeline_time_seconds", None)
        if pipeline_time:
            story.append(Paragraph(
                f'<font color="#6c7b7e" size="7">AI pipeline completed in {pipeline_time:.1f} seconds.</font>',
                styles['RMuted']
            ))
            story.append(Spacer(1, 3*mm))

        # ── DISCLAIMER ────────────────────────────────────────────────────────
        story.append(HRFlowable(width=full_w, thickness=0.5, color=LINE))
        story.append(Spacer(1, 2*mm))
        story.append(Paragraph(
            "DISCLAIMER: This report is generated by the RetinaAI AI-assisted screening system "
            "(SIH 26038) and is intended for use as a clinical decision-support tool only. "
            "AI outputs are not a substitute for professional medical examination. "
            "Final clinical decisions must be made by a qualified healthcare professional. "
            "Grad-CAM attention maps indicate model focus regions and are not equivalent "
            "to lesion segmentation masks.",
            styles['RDisclaimer']
        ))
        story.append(Spacer(1, 2*mm))
        story.append(Paragraph(
            f"Generated by RetinaAI · SIH 26038 · {datetime.now().strftime('%d %b %Y %H:%M')}",
            ParagraphStyle('footer', fontName='Helvetica', fontSize=7,
                           textColor=MUTED, alignment=TA_CENTER)
        ))

        doc.build(story)
        return output_path


