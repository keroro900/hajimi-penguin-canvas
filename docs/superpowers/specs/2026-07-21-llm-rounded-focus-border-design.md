# LLM Rounded Focus Border Design

The LLM node's painted card owns its rounded selection border. Its unpainted `SmartNodeShell` must not become an extra keyboard focus stop because it has no shell-level keyboard action and has a zero-pixel radius. Removing the caller-supplied `tabIndex=0` prevents the rectangular global focus outline from competing with the card's 20px rounded selection geometry. Nested inputs, selects, and buttons remain keyboard accessible.

The regression audit also rejects future `SmartNodeShell` callers that inject `tabIndex` through `rootProps`; shell focusability remains reserved for `onKeyboardActivate`, which already provides a meaningful Space-key action.
