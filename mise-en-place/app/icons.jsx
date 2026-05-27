// Line icon set — uniform 1.6 stroke, 20×20 viewBox, optically aligned.
// Color inherits via currentColor.

const MEPIconBase = ({ children, size = 18, sw = 1.6, style }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
    stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
    style={style}>
    {children}
  </svg>
);

const MEPIcons = {
  // Brand mark — three vertical strokes representing knives/prep at station
  Logo: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 20} height={p.size || 20} fill="none">
      <rect x="2.5" y="3.5" width="3" height="17" rx="1.2" stroke="currentColor" strokeWidth="1.6"/>
      <rect x="10.5" y="3.5" width="3" height="13" rx="1.2" stroke="currentColor" strokeWidth="1.6"/>
      <rect x="18.5" y="3.5" width="3" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  ),
  Dashboard: (p) => <MEPIconBase {...p}><rect x="2.5" y="2.5" width="6.5" height="7" rx="1"/><rect x="11" y="2.5" width="6.5" height="4" rx="1"/><rect x="2.5" y="11.5" width="6.5" height="6" rx="1"/><rect x="11" y="8.5" width="6.5" height="9" rx="1"/></MEPIconBase>,
  Receipt: (p) => <MEPIconBase {...p}><path d="M4.5 2.5h11v15l-2-1.5-2 1.5-2-1.5-1.5 1.5-2-1.5-1.5 1.5v-15z"/><path d="M7 6.5h6M7 9.5h6M7 12.5h4"/></MEPIconBase>,
  Truck: (p) => <MEPIconBase {...p}><path d="M2.5 5.5h9v8h-9z"/><path d="M11.5 8.5h4l2 2.5v2.5h-6"/><circle cx="6" cy="14.5" r="1.6"/><circle cx="14" cy="14.5" r="1.6"/></MEPIconBase>,
  Trend: (p) => <MEPIconBase {...p}><path d="M2.5 14.5l4.5-5 3 2.5 5.5-6.5"/><path d="M12.5 5.5h3v3"/></MEPIconBase>,
  Tag: (p) => <MEPIconBase {...p}><path d="M2.5 2.5h6.5l8.5 8.5-6.5 6.5-8.5-8.5v-6.5z"/><circle cx="6" cy="6" r="1"/></MEPIconBase>,
  Wallet: (p) => <MEPIconBase {...p}><rect x="2.5" y="4.5" width="15" height="12" rx="1.5"/><path d="M2.5 7.5h15"/><circle cx="13.5" cy="12" r="0.9" fill="currentColor" stroke="none"/></MEPIconBase>,
  Bell: (p) => <MEPIconBase {...p}><path d="M5 13l-.7 1.5h11.4L15 13V9a5 5 0 10-10 0v4z"/><path d="M8.5 16.5a1.5 1.5 0 003 0"/></MEPIconBase>,
  Settings: (p) => <MEPIconBase {...p}><circle cx="10" cy="10" r="2.4"/><path d="M10 1.7v2.4M10 15.9v2.4M3.7 3.7l1.7 1.7M14.6 14.6l1.7 1.7M1.7 10h2.4M15.9 10h2.4M3.7 16.3l1.7-1.7M14.6 5.4l1.7-1.7"/></MEPIconBase>,
  Help: (p) => <MEPIconBase {...p}><circle cx="10" cy="10" r="7.5"/><path d="M7.5 7.5a2.5 2.5 0 014.5 1.5c0 1.5-2 1.5-2 3"/><circle cx="10" cy="14" r="0.6" fill="currentColor" stroke="none"/></MEPIconBase>,
  Plus: (p) => <MEPIconBase {...p}><path d="M10 4v12M4 10h12"/></MEPIconBase>,
  Search: (p) => <MEPIconBase {...p}><circle cx="9" cy="9" r="5.5"/><path d="M13 13l3.5 3.5"/></MEPIconBase>,
  Filter: (p) => <MEPIconBase {...p}><path d="M2.5 4.5h15l-6 7v5l-3-1.5v-3.5z"/></MEPIconBase>,
  Download: (p) => <MEPIconBase {...p}><path d="M10 2.5v10M5.5 8.5l4.5 4.5 4.5-4.5M3 16.5h14"/></MEPIconBase>,
  Upload: (p) => <MEPIconBase {...p}><path d="M10 16.5v-10M5.5 10.5l4.5-4.5 4.5 4.5M3 3.5h14"/></MEPIconBase>,
  Sun: (p) => <MEPIconBase {...p}><circle cx="10" cy="10" r="3.2"/><path d="M10 2v1.8M10 16.2V18M2 10h1.8M16.2 10H18M4.3 4.3l1.3 1.3M14.4 14.4l1.3 1.3M4.3 15.7l1.3-1.3M14.4 5.6l1.3-1.3"/></MEPIconBase>,
  Moon: (p) => <MEPIconBase {...p}><path d="M16.5 12.5A7 7 0 018 4a7 7 0 1010 8.5z"/></MEPIconBase>,
  ChevronDown: (p) => <MEPIconBase {...p}><path d="M5 8l5 5 5-5"/></MEPIconBase>,
  ChevronRight: (p) => <MEPIconBase {...p}><path d="M8 5l5 5-5 5"/></MEPIconBase>,
  ChevronLeft: (p) => <MEPIconBase {...p}><path d="M12 5l-5 5 5 5"/></MEPIconBase>,
  ArrowUp: (p) => <MEPIconBase {...p}><path d="M10 16V4M5 9l5-5 5 5"/></MEPIconBase>,
  ArrowDown: (p) => <MEPIconBase {...p}><path d="M10 4v12M5 11l5 5 5-5"/></MEPIconBase>,
  Check: (p) => <MEPIconBase {...p}><path d="M4 10.5l3.5 3.5L16 5.5"/></MEPIconBase>,
  X: (p) => <MEPIconBase {...p}><path d="M5 5l10 10M15 5L5 15"/></MEPIconBase>,
  AlertTriangle: (p) => <MEPIconBase {...p}><path d="M10 2.5l8 14h-16z"/><path d="M10 8v3.5"/><circle cx="10" cy="13.5" r="0.7" fill="currentColor" stroke="none"/></MEPIconBase>,
  Clock: (p) => <MEPIconBase {...p}><circle cx="10" cy="10" r="7.5"/><path d="M10 6v4l2.5 2"/></MEPIconBase>,
  Info: (p) => <MEPIconBase {...p}><circle cx="10" cy="10" r="7.5"/><path d="M10 9v4.5"/><circle cx="10" cy="6.5" r="0.6" fill="currentColor" stroke="none"/></MEPIconBase>,
  DotsH: (p) => <MEPIconBase {...p}><circle cx="4" cy="10" r="0.9" fill="currentColor"/><circle cx="10" cy="10" r="0.9" fill="currentColor"/><circle cx="16" cy="10" r="0.9" fill="currentColor"/></MEPIconBase>,
  File: (p) => <MEPIconBase {...p}><path d="M5 2.5h7l3.5 3.5v11h-10.5z"/><path d="M12 2.5v3.5h3.5"/></MEPIconBase>,
  Image: (p) => <MEPIconBase {...p}><rect x="2.5" y="3.5" width="15" height="13" rx="1.5"/><circle cx="7" cy="8" r="1.2"/><path d="M3 14l4-4 4 4 3-3 3 3"/></MEPIconBase>,
  Trash: (p) => <MEPIconBase {...p}><path d="M3 5h14M8 5V3.5h4V5M5 5l1 12h8l1-12M9 8.5v6M11 8.5v6"/></MEPIconBase>,
  Edit: (p) => <MEPIconBase {...p}><path d="M3 17h3.5l9-9-3.5-3.5-9 9z"/><path d="M12.5 5l3.5 3.5"/></MEPIconBase>,
  Camera: (p) => <MEPIconBase {...p}><path d="M2.5 6.5h3l1.5-2h6l1.5 2h3v9h-15z"/><circle cx="10" cy="11" r="3"/></MEPIconBase>,
  Mail: (p) => <MEPIconBase {...p}><rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><path d="M3 6l7 5 7-5"/></MEPIconBase>,
  Calendar: (p) => <MEPIconBase {...p}><rect x="2.5" y="4.5" width="15" height="13" rx="1.5"/><path d="M3 8h14M6.5 2.5v3M13.5 2.5v3"/></MEPIconBase>,
  Star: (p) => <MEPIconBase {...p}><path d="M10 2.5l2.5 5 5.5.8-4 4 1 5.5-5-2.7-5 2.7 1-5.5-4-4 5.5-.8z"/></MEPIconBase>,
  Grip: (p) => <MEPIconBase {...p}><circle cx="7" cy="6" r="0.9" fill="currentColor"/><circle cx="13" cy="6" r="0.9" fill="currentColor"/><circle cx="7" cy="10" r="0.9" fill="currentColor"/><circle cx="13" cy="10" r="0.9" fill="currentColor"/><circle cx="7" cy="14" r="0.9" fill="currentColor"/><circle cx="13" cy="14" r="0.9" fill="currentColor"/></MEPIconBase>,
  Eye: (p) => <MEPIconBase {...p}><path d="M1.5 10s3-5.5 8.5-5.5S18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z"/><circle cx="10" cy="10" r="2.2"/></MEPIconBase>,
  Pdf: (p) => <MEPIconBase {...p}><path d="M5 2.5h7l3.5 3.5v11h-10.5z"/><path d="M12 2.5v3.5h3.5"/><path d="M7 10.5h1a1 1 0 010 2H7v-2zM7 12.5v2"/><path d="M11.5 10.5h1.5M11.5 12.5h1.5M11.5 10.5v4"/></MEPIconBase>,
  Sparkle: (p) => <MEPIconBase {...p}><path d="M10 3v3M10 14v3M3 10h3M14 10h3M5 5l2 2M13 13l2 2M5 15l2-2M13 7l2-2"/></MEPIconBase>,
  RefreshCw: (p) => <MEPIconBase {...p}><path d="M16 4v4h-4M4 16v-4h4"/><path d="M16 8a6 6 0 00-10-2.5M4 12a6 6 0 0010 2.5"/></MEPIconBase>,
};

Object.assign(window, { MEPIcons });
