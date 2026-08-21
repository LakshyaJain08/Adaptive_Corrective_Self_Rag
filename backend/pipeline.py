import os
from pathlib import Path
from typing import List, Optional
import sys

# Add the parent directory to sys.path so we can import acsrag
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from acsrag.graphs.phase8_iterative import build_phase8_graph

# Global cache for the compiled graph
_compiled_graph = None
_last_pdf_paths: List[str] = []

def get_pipeline(pdf_paths: List[str]):
    """
    Returns a compiled Phase 8 graph.
    If the pdf_paths are the same as last time, returns the cached graph.
    Otherwise, builds a new one.
    """
    global _compiled_graph, _last_pdf_paths

    # Simple caching logic: if the list of paths exactly matches, return cache
    if _compiled_graph is not None and sorted(pdf_paths) == sorted(_last_pdf_paths):
        return _compiled_graph

    import hashlib
    paths_str = "".join(sorted([str(p) for p in pdf_paths]))
    suffix = hashlib.md5(paths_str.encode()).hexdigest()

    print("Building ACSRAG Phase 8 graph for documents:", pdf_paths)
    _compiled_graph = build_phase8_graph(pdf_paths, cache_suffix=suffix)
    _last_pdf_paths = pdf_paths.copy()
    
    return _compiled_graph
