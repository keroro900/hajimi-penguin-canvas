# Card-attached Edge Endpoints Design

The visible connection handle stays outside the node with its existing 38px hit target. React Flow anchors horizontal paths at the outer edge of each Handle, so completed edges and snapped connection previews compensate the 19px center displacement plus the largest 8px handle radius. Left endpoints move right by 27px and right endpoints move left by 27px; top/bottom endpoints and GroupBox handles are unchanged. Regular 14px handles place the path 1px beneath the opaque card border, avoiding a visible seam.

One pure geometry helper owns the compensation. `DeletableEdge` uses it for both source and target path coordinates, while the React Flow connection-line component uses it for the origin and for a snapped destination. Tests lock the directional math, GroupBox exemption, shared use, and the CSS/TypeScript offset contract.
