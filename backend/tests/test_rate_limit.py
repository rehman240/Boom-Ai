from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.rate_limit import rate_limit


def test_route_limit_blocks_after_limit():
    app = FastAPI()

    @app.post("/try", dependencies=[Depends(rate_limit("3/minute"))])
    def try_it():
        return {"ok": True}

    client = TestClient(app)
    codes = [client.post("/try").status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]
