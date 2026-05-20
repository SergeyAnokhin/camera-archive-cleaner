"""Per-million-token pricing (USD) for AI providers. Keys must match request model IDs."""

GEMINI_PRICING = {
    'gemini-3.1-flash-lite':    {'input': 0.25,  'output': 1.50},
    'gemini-2.5-flash-lite':    {'input': 0.10,  'output': 0.40},
    'gemini-2.5-flash':         {'input': 0.30,  'output': 2.50},
    'gemini-3.1-flash-preview': {'input': 0.50,  'output': 3.00},
    'gemini-3.5-flash':         {'input': 1.50,  'output': 9.00},
    'gemini-2.5-pro':           {'input': 1.25,  'output': 10.00},
    'gemini-3.1-pro-preview':   {'input': 2.00,  'output': 12.00},
}

CLAUDE_PRICING = {
    'claude-opus-4-7':            {'input': 15.00, 'output': 75.00},
    'claude-sonnet-4-6':          {'input':  3.00, 'output': 15.00},
    'claude-haiku-4-5-20251001':  {'input':  0.80, 'output':  4.00},
    'claude-3-5-sonnet-20241022': {'input':  3.00, 'output': 15.00},
    'claude-3-5-haiku-20241022':  {'input':  0.80, 'output':  4.00},
    'claude-3-opus-20240229':     {'input': 15.00, 'output': 75.00},
}
