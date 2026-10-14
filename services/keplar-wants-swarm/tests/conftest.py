import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from keplar_wants import diagnostics as diag  # noqa: E402
from keplar_wants.context import Context  # noqa: E402
from keplar_wants.registry_swarm import Catalogue, JobQueue, SimulatedExecutor, SwarmPipeline  # noqa: E402


@pytest.fixture(autouse=True)
def diag_log(tmp_path):
    path = diag.configure(str(tmp_path / "swarm_diagnostics.log"))
    diag.METRICS.reset()
    yield Path(path)


@pytest.fixture(scope="session")
def catalogue():
    c = Catalogue(":memory:")
    c.populate(20_000)
    return c


@pytest.fixture
async def ctx(tmp_path, catalogue):
    q = JobQueue(SwarmPipeline(catalogue, SimulatedExecutor(), SimulatedExecutor(), step_timeout=5.0), workers=2)
    c = Context(catalogue=catalogue, queue=q, workspace_root=tmp_path / "ws")
    yield c
    await q.stop()


os.environ.setdefault("KEPLAR_WANTS_SWARM_TOKEN", "test-token")
