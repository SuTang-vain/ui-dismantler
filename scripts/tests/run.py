"""run.py — 一键运行 ui-dismantler 工具层全部单元测试

用法：
    python3 scripts/tests/run.py

退出码：0 全过，1 有失败。
"""

import os
import sys
import unittest


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=here, pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
