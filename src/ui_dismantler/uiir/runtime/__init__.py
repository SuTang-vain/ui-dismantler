"""Runtime observation extractors (Playwright-driven scenario execution).

These modules open the source HTML in an isolated headless browser and record
event registrations, candidate inventory, state transitions, and assertion
outcomes. They are enhancements: Playwright, browser, or page failures only
append warnings and never block manifest -> UI-IR conversion.
"""
