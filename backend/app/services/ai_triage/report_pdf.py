"""Exporta o relatorio Markdown ja salvo em PDF (RF13, issue #32)."""

from io import BytesIO

from jinja2 import Environment
from markdown import markdown
from xhtml2pdf import pisa
from xhtml2pdf.config.resources import ResourceAccessPolicy

from app.models import Report

# o relatorio carrega texto vindo do alvo escaneado - o PDF nao pode buscar URL nem ler arquivo local
_NO_RESOURCES = ResourceAccessPolicy(allow_remote=False, base_dir=None)

_TEMPLATE = Environment(autoescape=True).from_string(
    """<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: a4; margin: 2cm; }
  body { font-family: Helvetica; font-size: 10pt; color: #1f2933; }
  h1 { font-size: 18pt; }
  h2 { font-size: 14pt; border-bottom: 1px solid #cbd2d9; padding-bottom: 2px; }
  h3 { font-size: 11pt; }
  h4 { font-size: 10pt; }
  pre { font-family: Courier; font-size: 8pt; background-color: #f5f7fa; padding: 6px;
        white-space: pre-wrap; word-wrap: break-word; }
  .meta { color: #616e7c; font-size: 8pt; }
</style>
</head>
<body>
<p class="meta">scan {{ report.scan_job_id }} · gerado em {{ report.generated_at.strftime("%d/%m/%Y %H:%M") }} UTC</p>
{{ body | safe }}
</body>
</html>"""
)


def render_report_pdf(report: Report) -> bytes:
    body = markdown(report.markdown_content, extensions=["fenced_code"])
    pdf = BytesIO()
    status = pisa.CreatePDF(
        _TEMPLATE.render(report=report, body=body),
        dest=pdf,
        encoding="utf-8",
        resource_policy=_NO_RESOURCES,
    )
    if status.err:
        raise RuntimeError(f"falha ao gerar o PDF do relatorio do scan {report.scan_job_id}")
    return pdf.getvalue()
