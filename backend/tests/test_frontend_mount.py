from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.frontend import mount_frontend


def _client(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>painel</html>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "segredo.txt").write_text("nao pode vazar")

    app = FastAPI()

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    assert mount_frontend(app, dist)
    return TestClient(app)


def test_serve_index_e_rotas_do_spa(tmp_path):
    c = _client(tmp_path)
    assert c.get("/").text == "<html>painel</html>"
    assert c.get("/dashboard").text == "<html>painel</html>"


def test_serve_assets(tmp_path):
    assert _client(tmp_path).get("/assets/app.js").text == "console.log(1)"


def test_api_continua_funcionando_e_404_nao_vira_index(tmp_path):
    c = _client(tmp_path)
    assert c.get("/api/health").json() == {"status": "ok"}
    assert c.get("/api/nao-existe").status_code == 404


def test_nao_sai_da_pasta_dist(tmp_path):
    r = _client(tmp_path).get("/..%2Fsegredo.txt")
    assert "nao pode vazar" not in r.text


def test_sem_build_nao_registra(tmp_path):
    assert mount_frontend(FastAPI(), tmp_path / "vazio") is False
