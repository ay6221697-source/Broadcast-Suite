import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { QRCodeCanvas } from 'qrcode.react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';

const BACKEND_URL = "https://broadcast-suite-1.onrender.com";

const firebaseConfig = {
  apiKey: "AIzaSyCZHIxA3JK4iKuo9Kpo9p9jnyH9cv83vB0", 
  authDomain: "whatsapp-e0dd2.firebaseapp.com",
  projectId: "whatsapp-e0dd2",
  storageBucket: "whatsapp-e0dd2.firebasestorage.app",
  messagingSenderId: "281810673119",
  appId: "1:281810673119:web:e29181322d0b1b13d7786a"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [profileAccounts, setProfileAccounts] = useState([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState('terminal_alpha');
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [qrString, setQrString] = useState('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const [parsedRows, setParsedRows] = useState([]);
  const [excelColumns, setExcelColumns] = useState([]);
  const [templateMessage, setTemplateMessage] = useState('Hi {{Name}}, greeting from workspace team! {{Company}}');
  const [uploadLoading, setUploadLoading] = useState(false);

  const [attachedImage, setAttachedImage] = useState(null);      
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');     
  const [imageCaption, setImageCaption] = useState('');          
  const imageInputRef = useRef(null);

  const [scheduleTime, setScheduleTime] = useState('');
  const [isScheduledCampaign, setIsScheduledCampaign] = useState(false);

  const [aiContext, setAiContext] = useState('');
  const [aiTone, setAiTone] = useState('Professional');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiConsole, setShowAiConsole] = useState(false);

  const [syncingTerminals, setSyncingTerminals] = useState({});

  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const textareaRef = useRef(null);
  const socketRef = useRef(null);

  const showNotification = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 4500);
  };

  useEffect(() => {
    socketRef.current = io(BACKEND_URL, { transports: ['websocket', 'polling'] });

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    socketRef.current.emit('join_instance', { instanceId: selectedInstanceId });

    socketRef.current.on('profiles_update', (profiles) => {
      setProfileAccounts(profiles);
      const activeMatch = profiles.find(p => p.id === selectedInstanceId);
      if (activeMatch) {
        setConnectionStatus(activeMatch.status);
        if (activeMatch.status === 'Scan' && activeMatch.qr) setQrString(activeMatch.qr);
      }
    });

    socketRef.current.on('qr_code', (data) => {
      setProfileAccounts(prev => prev.map(p => p.id === data.instanceId ? { ...p, qr: data.qr, status: 'Scan' } : p));
      if (data.instanceId === selectedInstanceId) {
        setQrString(data.qr);
        setConnectionStatus('Scan');
      }
    });

    socketRef.current.on('status_change', (data) => {
      if (data.instanceId === selectedInstanceId) {
        setConnectionStatus(data.status);
        if (data.status === 'Connected') { setQrString(''); setIsQrModalOpen(false); }
        if (data.status === 'Scan' && data.qr) setQrString(data.qr);
      }
      setProfileAccounts(prev => prev.map(p =>
        p.id === data.instanceId
          ? { ...p, status: data.status, qr: data.status === 'Connected' ? '' : (data.qr || p.qr) }
          : p
      ));
      setSyncingTerminals(prev => ({ ...prev, [data.instanceId]: false }));
    });

    socketRef.current.on('device_sync_result', (data) => {
      setSyncingTerminals(prev => ({ ...prev, [data.instanceId]: false }));
      showNotification(
        data.status === 'Connected'
          ? `✅ ${data.instanceId.toUpperCase()} is connected.`
          : `⚠️ ${data.instanceId.toUpperCase()} status: ${data.status}`,
        data.status === 'Connected' ? 'success' : 'warning'
      );
    });

    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = `
      @keyframes toastSlideIn { from { transform: translateY(30px) scale(0.95); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
      @keyframes pulseAura { 0% { box-shadow: 0 0 0 0 rgba(0, 168, 132, 0.4); } 70% { box-shadow: 0 0 0 12px rgba(0, 168, 132, 0); } 100% { box-shadow: 0 0 0 0 rgba(0, 168, 132, 0); } }
      @keyframes modalFadeIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .toast-notification { animation: toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      .pulse-active { animation: pulseAura 2s infinite; }
      .modal-animation { animation: modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      .spinning { animation: spin 0.9s linear infinite; }
      .input-focus-effect { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
      .input-focus-effect:focus { border-color: #00a884 !important; background-color: rgba(42, 57, 66, 0.6) !important; box-shadow: 0 0 0 3px rgba(0, 168, 132, 0.2) !important; }
      .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      .interactive-btn { transition: all 0.2s ease; }
      .interactive-btn:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
      .interactive-btn:active:not(:disabled) { transform: translateY(0); }
      .icon-logout-btn { background-color: transparent; border: none; color: #aebac1; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease; }
      .icon-logout-btn:hover { background-color: rgba(255, 255, 255, 0.08); color: #f25c5c; }
      
      .profile-item-container { display: flex; position: relative; overflow: hidden; }
      .row-action-controls { position: absolute; right: 8px; top: 50%; transform: translateY(-50%) translateX(10px); opacity: 0; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); display: flex; gap: 6px; align-items: center; background: linear-gradient(90deg, transparent 0%, #111b21 25%, #111b21 100%); padding-left: 20px; height: 100%; z-index: 5; }
      .profile-item-container:hover .row-action-controls { opacity: 1; transform: translateY(-50%) translateX(0); }
      .profile-item-container.active-row:hover .row-action-controls { background: linear-gradient(90deg, transparent 0%, #202c33 25%, #202c33 100%); }
      .terminal-control-icon { background: #202c33; border: 1px solid rgba(255,255,255,0.04); width: 32px; height: 32px; border-radius: 8px; color: #aebac1; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease; box-shadow: 0 4px 10px rgba(0,0,0,0.2); }
      .terminal-control-icon:hover { transform: scale(1.05); }
      .terminal-control-icon.wa-link:hover { color: #00a884; background-color: rgba(0, 168, 132, 0.1); border-color: rgba(0, 168, 132, 0.2); }
      .terminal-control-icon.term-logout:hover { color: #f25c5c; background-color: rgba(242, 92, 92, 0.1); border-color: rgba(242, 92, 92, 0.2); }

      .dataset-scroll-container { width: 100%; overflow-x: auto; margin-top: 14px; border-radius: 8px; border: 1px solid #222e35; background-color: rgba(11, 20, 26, 0.4); }
      .dataset-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
      .dataset-table th { background-color: #202c33; color: #8696a0; font-weight: 500; padding: 10px 14px; border-bottom: 1px solid #222e35; white-space: nowrap; }
      .dataset-table td { padding: 10px 14px; color: #d1d7db; border-bottom: 1px solid rgba(255,255,255,0.02); white-space: nowrap; }
      .dataset-table tr:hover { background-color: rgba(255,255,255,0.02); }

      @media (max-width: 900px) {
        .wa-grid-layout { grid-template-columns: 1fr !important; height: auto !important; overflow-y: visible !important; }
        .wa-sidebar-element { border-right: none !important; border-bottom: 1px solid #222e35 !important; height: auto !important; max-height: 380px; }
        .compositor-split-view { grid-template-columns: 1fr !important; }
        .app-container-element { height: auto !important; min-height: 100vh; overflow-y: auto !important; padding: 8px !important; }
        .wa-layout-box { height: auto !important; overflow: visible !important; }
        .premium-header-flex { height: auto !important; padding: 16px !important; flex-direction: column !important; gap: 14px !important; align-items: flex-start !important; }
        .header-action-cluster { width: 100% !important; justify-content: space-between !important; }
        .mobile-block-banner { width: 100% !important; }
      }
    `;
    document.head.appendChild(styleSheet);

    return () => {
      unsubscribeAuth();
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [selectedInstanceId]);

  const handleTerminalOpenDevice = (e, instanceId) => {
    e.stopPropagation();
    setSyncingTerminals(prev => ({ ...prev, [instanceId]: true }));
    if (socketRef.current) socketRef.current.emit('request_device_sync', { instanceId });
    setTimeout(() => setSyncingTerminals(prev => ({ ...prev, [instanceId]: false })), 10000);
  };

  const handleTerminalDisconnect = (e, instanceId) => {
    e.stopPropagation(); 
    showNotification(`Disconnecting node: ${instanceId.toUpperCase()}`, "warning");
    if (socketRef.current) socketRef.current.emit('logout_terminal_instance', { instanceId });
  };

  const handleImageAttach = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setAttachedImage(file);

    if (file.type.startsWith('image/')) {
      setImagePreviewUrl(URL.createObjectURL(file));
      showNotification(`Image attached successfully.`, "success");
    } else {
      setImagePreviewUrl(''); 
      showNotification(`Document attached for streaming: ${file.name}`, "success");
    }
  };

  const handleRemoveImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setAttachedImage(null); setImagePreviewUrl(''); setImageCaption('');
    if (imageInputRef.current) imageInputRef.current.value = '';
    showNotification("Attachment cleared.", "info");
  };

  const changeProfileTerminalContext = (instanceId) => {
    setQrString('');
    const targetProfile = profileAccounts.find(p => p.id === instanceId);
    setConnectionStatus(targetProfile ? targetProfile.status : 'Disconnected');
    if (targetProfile && targetProfile.status === 'Scan' && targetProfile.qr) setQrString(targetProfile.qr);
    setSelectedInstanceId(instanceId);
    if (socketRef.current) socketRef.current.emit('join_instance', { instanceId });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return showNotification("Please fill in all fields.", "warning");
    setAuthLoading(true); setPasswordError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showNotification("Welcome back!", "success");
    } catch (err) {
      setPasswordError("Incorrect email or password.");
      showNotification("Authentication failed.", "error");
    } finally { setAuthLoading(false); }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setUploadLoading(true);
    const formData = new FormData();
    formData.append('excelFile', file);
    try {
      const identityJwtToken = await auth.currentUser?.getIdToken();
      const response = await fetch(`${BACKEND_URL}/api/upload-recipients`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${identityJwtToken}` },
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        setParsedRows(data.data);
        const allKeys = new Set();
        data.data.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
        setExcelColumns([...allKeys]);
        showNotification(`Loaded ${data.data.length} contacts across grid maps.`, "success");
      } else {
        showNotification("File parsing rejection from node.", "error");
      }
    } catch (err) { showNotification("Failed to parse the file.", "error"); }
    finally { setUploadLoading(false); }
  };

  const handleAiRecommendation = async () => {
    if (!aiContext.trim()) return showNotification("Please describe your campaign first.", "warning");
    setAiLoading(true);
    try {
      const identityJwtToken = await auth.currentUser?.getIdToken();
      const response = await fetch(`${BACKEND_URL}/api/generate-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${identityJwtToken}` },
        body: JSON.stringify({ businessContext: aiContext, tone: aiTone, sampleRow: parsedRows[0] || null })
      });
      const data = await response.json();
      if (data.success) { setTemplateMessage(data.text); showNotification("AI template updated!", "success"); }
      else showNotification(data.error || "Generation failed.", "error");
    } catch (err) { showNotification("Could not connect to AI engine.", "error"); }
    finally { setAiLoading(false); }
  };

  const executeMasterCampaignPipeline = async () => {
    if (parsedRows.length === 0) return showNotification("Please upload a contacts file first!", "warning");
    const identityJwtToken = await auth.currentUser?.getIdToken();
    const fd = new FormData();
    fd.append('instanceId', selectedInstanceId);
    fd.append('list', JSON.stringify(parsedRows));
    fd.append('messageTemplate', templateMessage);
    fd.append('fileCaption', imageCaption);

    if (attachedImage) fd.append('broadcastFile', attachedImage); 
    if (isScheduledCampaign && scheduleTime) fd.append('scheduledTimestamp', scheduleTime);
    
    const endpoint = isScheduledCampaign ? 'schedule-broadcast' : 'broadcast';
    try {
      const response = await fetch(`${BACKEND_URL}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${identityJwtToken}` },
        body: fd
      });
      const data = await response.json();
      if (data.success) showNotification(isScheduledCampaign ? "Campaign scheduled!" : "Broadcast started successfully!", "success");
      else showNotification(data.error || "Failed to start broadcast.", "error");
    } catch (err) { showNotification("Connection to backend failed.", "error"); }
  };

  const injectTagToken = (token) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const startPos = textarea.selectionStart;
    const modifiedText = textarea.value.substring(0, startPos) + `{{${token}}}` + textarea.value.substring(textarea.selectionEnd);
    setTemplateMessage(modifiedText);
    setTimeout(() => textarea.focus(), 50);
  };

  const renderLivePreview = () => {
    let preview = templateMessage;
    const sampleRecord = parsedRows[0] || { Name: "Ajay", Company: "Workspace Team" };
    Object.keys(sampleRecord).forEach(key => {
      preview = preview.replace(new RegExp(`{{${key}}}`, 'g'), `<strong style="color:#00d4ff;font-weight:600;">${sampleRecord[key]}</strong>`);
    });
    return { __html: preview };
  };

  const tableHeaders = excelColumns;

  return (
    <div className="app-container-element" style={styles.appContainer}>
      {toast.show && (
        <div className="toast-notification" style={{ ...styles.toastWrapper, ...styles.toastTypeStyles[toast.type] }}>
          <span>{toast.message}</span>
        </div>
      )}

      {isQrModalOpen && qrString && (
        <div onClick={() => setIsQrModalOpen(false)} style={styles.modalBackdropOverlay}>
          <div onClick={(e) => e.stopPropagation()} className="modal-animation" style={styles.modalContentGlassBox}>
            <div style={styles.modalHeaderGroup}>
              <div>
                <h4 style={styles.modalTitleText}>Pair Account Node</h4>
                <p style={styles.modalSubtitleText}>Scan from WhatsApp → Linked Devices</p>
              </div>
              <button onClick={() => setIsQrModalOpen(false)} style={styles.modalCloseXButton}>✕</button>
            </div>
            <div style={styles.modalCentralCanvasContainer}>
              <QRCodeCanvas value={qrString} size={260} level="H" bgColor="#ffffff" fgColor="#111b21" includeMargin={true} />
            </div>
            <div style={styles.modalFooterBadge}>
              <span className="pulse-active" style={styles.modalLiveIndicatorDot}></span>
              <span style={{ fontSize: '12px', color: '#aebac1', fontWeight: '500' }}>Live: {selectedInstanceId.toUpperCase()}</span>
            </div>
          </div>
        </div>
      )}

      <div className="wa-layout-box" style={styles.waLayoutContainer}>
        <header className="premium-header-flex" style={styles.header}>
          <div className="mobile-block-banner" style={styles.brandGroup}>
            <div style={styles.logoSubText}>PRYTIK TECHNOLOGIES</div>
            <h1 style={styles.logoMainText}>Broadcast Suite</h1>
          </div>
          <div className="header-action-cluster" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={styles.statusBadge}>
              <span className={connectionStatus.toLowerCase() === 'connected' ? 'pulse-active' : ''} style={styles.statusDot(connectionStatus)}></span>
              <span style={{ color: '#8696a0', fontSize: '13px' }}>Node: <strong style={styles.nodeHighlight}>{selectedInstanceId.toUpperCase()}</strong></span>
            </div>
            <button onClick={() => signOut(auth)} className="icon-logout-btn" title="Secure Sign Out">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </header>

        <div className="wa-grid-layout" style={styles.waBodyWrapperGrid}>
          <aside className="wa-sidebar-element" style={styles.waLeftSidebar}>
            <div style={styles.sidebarMetaBanner}>
              <div style={{ fontSize: '12px', fontWeight: '500', color: '#e9edef' }}>WhatsApp Active Nodes</div>
            </div>
            <div style={styles.sidebarScrollZone} className="custom-scrollbar">
              {profileAccounts.map((profile) => (
                <div
                  key={profile.id}
                  onClick={() => changeProfileTerminalContext(profile.id)}
                  className={`profile-item-container ${profile.id === selectedInstanceId ? 'active-row' : ''}`}
                  style={styles.waProfileRowItem(profile.id === selectedInstanceId)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minWidth: 0, paddingRight: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h4 style={{ ...styles.waRowTitle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{profile.name}</h4>
                      <span style={styles.waRowBadgeStatus(profile.status)}>{profile.status}</span>
                    </div>
                    <p style={styles.waRowSubtitle}>ID: {profile.id}</p>
                  </div>

                  <div className="row-action-controls">
                    <button
                      onClick={(e) => handleTerminalOpenDevice(e, profile.id)}
                      className="terminal-control-icon wa-link"
                      title="Sync Active Device Connection"
                      disabled={syncingTerminals[profile.id]}
                    >
                      {syncingTerminals[profile.id] ? (
                        <svg className="spinning" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={(e) => handleTerminalDisconnect(e, profile.id)}
                      className="terminal-control-icon term-logout"
                      title="Terminate Node Session"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.sidebarQrFooterZone}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h5 style={{ fontSize: '12px', color: '#e9edef', margin: 0, fontWeight: '500' }}>Quick Pair Node</h5>
                <button onClick={() => setShowAiConsole(!showAiConsole)} className="interactive-btn" style={styles.iconActionButton}>✨ Copilot AI</button>
              </div>
              <div 
                onClick={() => qrString && setIsQrModalOpen(true)}
                style={{ ...styles.qrGlassHolder, cursor: qrString ? 'pointer' : 'default' }}
              >
                {qrString ? (
                  <div style={styles.qrCanvasWrapper}>
                    <QRCodeCanvas value={qrString} size={135} level="M" bgColor="#ffffff" fgColor="#111b21" />
                  </div>
                ) : (
                  <div style={{ color: connectionStatus.toLowerCase() === 'connected' ? '#00a884' : '#8696a0', fontSize: '12.5px', fontWeight: '500', textAlign: 'center', padding: '0 10px', lineHeight: '1.4' }}>
                    {connectionStatus.toLowerCase() === 'connected' ? '✅ Token Synchronized'
                      : connectionStatus.toLowerCase() === 'initializing' ? '⏳ Preparing Engine...'
                      : 'Awaiting synchronization...'}
                  </div>
                )}
              </div>
            </div>
          </aside>

          <main style={styles.waContentPanel}>
            <div style={styles.mainScrollableBody} className="custom-scrollbar">

              <section style={styles.studioCardSection}>
                <h3 style={styles.sectionInnerTitle}>1. Recipient Engine Dataset</h3>
                <p style={styles.sectionSubtitleText}>Upload dynamic recipient configurations lists via Excel or CSV file templates.</p>
                <div style={styles.fileUploaderArea}>
                  <input type="file" id="bulk-excel-file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                  <label htmlFor="bulk-excel-file" className="interactive-btn" style={styles.actionStyledUploadButton}>Choose File Source</label>
                  <div style={{ fontSize: '13px', color: parsedRows.length > 0 ? '#00a884' : '#8696a0', fontWeight: parsedRows.length > 0 ? '500' : '400' }}>
                    {uploadLoading
                      ? "Reading columns..."
                      : parsedRows.length > 0
                        ? `✅ ${parsedRows.length} contacts · ${excelColumns.length} columns loaded`
                        : "No file loaded"}
                  </div>
                </div>

                {parsedRows.length > 0 && (
                  <div className="dataset-scroll-container custom-scrollbar">
                    <table className="dataset-table">
                      <thead>
                        <tr>
                          {tableHeaders.map((header) => (
                            <th key={header}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.slice(0, 5).map((row, index) => (
                          <tr key={index}>
                            {tableHeaders.map((header) => (
                              <td key={header}>{row[header] !== undefined ? String(row[header]) : ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedRows.length > 5 && (
                      <div style={{ padding: '8px 14px', fontSize: '11px', color: '#8696a0', backgroundColor: '#111b21', textAlign: 'center', borderTop: '1px solid #222e35' }}>
                        Displaying system preview index parameters grid map boundary grids (top 5 of {parsedRows.length} records cached).
                      </div>
                    )}
                  </div>
                )}
              </section>

              {showAiConsole && (
                <section style={styles.aiAssistDockContainer}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '14px' }}>✨</span>
                    <h4 style={{ fontSize: '13.5px', margin: 0, fontWeight: '600', color: '#d8b4fe' }}>Smart Copilot Template Generator</h4>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '10px' }}>
                    <input type="text" className="input-focus-effect" value={aiContext} onChange={(e) => setAiContext(e.target.value)} placeholder="Describe campaign copy requirements..." style={styles.waInputStyle} />
                    <select value={aiTone} onChange={(e) => setAiTone(e.target.value)} style={styles.waSelectStyle}>
                      <option value="Professional">👔 Professional</option>
                      <option value="Casual & Friendly">👋 Casual</option>
                    </select>
                  </div>
                  <button onClick={handleAiRecommendation} disabled={aiLoading} className="interactive-btn" style={{ ...styles.aiActionButtonRun, marginTop: '10px' }}>
                    {aiLoading ? 'Synthesizing...' : 'Generate Parameters'}
                  </button>
                </section>
              )}

              <section style={styles.studioCardSection}>
                <h3 style={styles.sectionInnerTitle}>2. Message Content Compositor</h3>
                <p style={styles.sectionSubtitleText}>All columns from your file appear as tag buttons below. Click to inject.</p>

                <div style={styles.tokenButtonRack} className="custom-scrollbar">
                  {['Name', 'Company'].map(tag => (
                    <button key={tag} onClick={() => injectTagToken(tag)} className="interactive-btn" style={styles.tokenTagItem}>
                      + {tag}
                    </button>
                  ))}
                  {excelColumns
                    .filter(col => !['Name', 'Company', 'Phone', 'phone'].includes(col))
                    .map(col => (
                      <button key={col} onClick={() => injectTagToken(col)} className="interactive-btn" style={styles.tokenTagItem}>
                        + {col}
                      </button>
                    ))
                  }
                </div>

                <div className="compositor-split-view" style={styles.compositorSplitWorkspace}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <textarea ref={textareaRef} className="input-focus-effect" value={templateMessage} onChange={(e) => setTemplateMessage(e.target.value)} style={styles.waTextareaLayout} placeholder="Compose message template here..." />
                    
                    <div style={styles.imageAttachZone}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input ref={imageInputRef} type="file" id="broadcast-image-file" onChange={handleImageAttach} style={{ display: 'none' }} />
                        <label htmlFor="broadcast-image-file" className="interactive-btn" style={styles.imageAttachButton}>📎 Attach Document or Media Asset File</label>
                        {attachedImage && (
                          <button type="button" onClick={handleRemoveImage} className="interactive-btn" style={styles.imageRemoveButton}>✕ Remove</button>
                        )}
                      </div>
                      {attachedImage && (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '14px', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                          {imagePreviewUrl ? (
                            <div style={styles.imageThumbnailWrapper}><img src={imagePreviewUrl} alt="" style={styles.imageThumbnail} /></div>
                          ) : (
                            <div style={{ ...styles.imageThumbnailWrapper, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#202c33', color: '#00a884', fontSize: '20px' }}>📄</div>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12.5px', color: '#e9edef', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>{attachedImage.name}</div>
                            <input type="text" className="input-focus-effect" value={imageCaption} onChange={(e) => setImageCaption(e.target.value)} placeholder="Add optional file caption context..." style={styles.waInputStyle} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={styles.waDeviceSimulationPreviewBackground}>
                    <div style={styles.simulationOverlayHeader}>Realtime Preview Frame</div>
                    <div style={{ padding: '14px', flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
                      <div style={styles.waChatBubbleElement}>
                        {imagePreviewUrl && (
                          <div style={styles.bubbleImageWrapper}>
                            <img src={imagePreviewUrl} alt="" style={styles.bubbleImage} />
                            {imageCaption && <div style={styles.bubbleCaptionText}>{imageCaption}</div>}
                          </div>
                        )}
                        <div dangerouslySetInnerHTML={renderLivePreview()} style={{ wordBreak: 'break-word', marginTop: imagePreviewUrl ? '8px' : 0, fontSize: '13px', lineHeight: '1.4' }} />
                        <div style={styles.waBubbleTimestampContainer}>
                          <span style={styles.bubbleTimestampLabel}>12:00 PM</span>
                          <span style={styles.bubbleTicksVector}>✓✓</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section style={styles.schedulerWrapperBox}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" id="broadcast-toggle" checked={isScheduledCampaign} onChange={(e) => setIsScheduledCampaign(e.target.checked)} style={styles.waCheckboxStyle} />
                  <label htmlFor="broadcast-toggle" style={{ color: '#e9edef', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>⏰ Schedule campaign execution for later</label>
                </div>
                {isScheduledCampaign && (
                  <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12.5px', color: '#8696a0' }}>Trigger Time:</span>
                    <input type="datetime-local" className="input-focus-effect" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} style={styles.waChronoInput} />
                  </div>
                )}
              </section>

              <button onClick={executeMasterCampaignPipeline} disabled={parsedRows.length === 0} className="interactive-btn" style={styles.waPipelineSubmitActionBtn(parsedRows.length > 0)}>
                {isScheduledCampaign ? 'Commit Campaign To Queue' : 'Launch Mass Bulk Distribution'}
              </button>
            </div>
          </main>
        </div>

        <footer style={styles.footer}>
          <div>&copy; {new Date().getFullYear()} <strong>Prytik Technologies Private Limited</strong>. All rights reserved.</div>
        </footer>
      </div>
    </div>
  );
}

const styles = {
  appContainer: { height: '100vh', width: '100vw', backgroundColor: '#0c1317', color: '#e9edef', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  blurCircle: { position: 'absolute', width: '550px', height: '500px', borderRadius: '50%', zIndex: 0, opacity: 0.7 },
  authModalOverlay: { zIndex: 10, width: '100%', maxWidth: '400px' },
  authGlassForm: { backgroundColor: 'rgba(34, 46, 53, 0.55)', backdropFilter: 'blur(25px) saturate(190%)', border: '1px solid rgba(255, 255, 255, 0.07)', padding: '2.5rem 2.25rem', borderRadius: '16px', boxShadow: '0 24px 50px rgba(0, 0, 0, 0.4)' },
  authLogoIconWrapper: { display: 'inline-flex', backgroundColor: 'rgba(0,168,132,0.12)', padding: '12px', borderRadius: '12px', marginBottom: '1rem' },
  authTextInput: { width: '100%', boxSizing: 'border-box', backgroundColor: 'rgba(42,57,66,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px 14px', color: '#fff', fontSize: '14px', outline: 'none' },
  authErrorContainer: { color: '#f25c5c', fontSize: '13px', backgroundColor: 'rgba(242,92,92,0.08)', border: '1px solid rgba(242,92,92,0.15)', padding: '10px', borderRadius: '6px', marginBottom: '12px', fontWeight: '500' },
  authSubmitButton: { width: '100%', padding: '12px', backgroundColor: '#00a884', color: '#111b21', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  passwordEyeToggle: { position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#8696a0', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', outline: 'none' },
  modalBackdropOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(11,20,26,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modalContentGlassBox: { backgroundColor: '#222e35', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '360px', boxShadow: '0 30px 60px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '20px' },
  modalHeaderGroup: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalTitleText: { margin: 0, fontSize: '16px', fontWeight: '600', color: '#e9edef' },
  modalSubtitleText: { margin: '4px 0 0 0', fontSize: '12px', color: '#8696a0', lineHeight: '1.4' },
  modalCloseXButton: { background: 'transparent', border: 'none', color: '#8696a0', fontSize: '16px', cursor: 'pointer', padding: '4px', outline: 'none' },
  modalCentralCanvasContainer: { backgroundColor: '#fff', padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' },
  modalFooterBadge: { display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'center', backgroundColor: '#111b21', padding: '6px 14px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.04)' },
  modalLiveIndicatorDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#e0b339' },
  waLayoutContainer: { width: '100%', maxWidth: '1650px', height: '100%', backgroundColor: '#111b21', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 20px 45px rgba(0,0,0,0.5)' },
  header: { minHeight: '64px', backgroundColor: '#202c33', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.03)', boxSizing: 'border-box' },
  brandGroup: { display: 'flex', flexDirection: 'column' },
  logoSubText: { fontSize: '9px', fontWeight: '700', color: '#00a884', letterSpacing: '2.5px' },
  logoMainText: { fontSize: '16px', fontWeight: '600', color: '#e9edef', margin: '2px 0 0 0' },
  statusBadge: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#111b21', padding: '6px 14px', borderRadius: '20px', fontSize: '12.5px', border: '1px solid rgba(255,255,255,0.05)' },
  statusDot: (status) => ({ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: status.toLowerCase() === 'connected' ? '#00a884' : status.toLowerCase() === 'initializing' ? '#e0b339' : '#f25c5c', display: 'inline-block' }),
  nodeHighlight: { color: '#53bdeb', marginLeft: '2px', fontWeight: '500' },
  waBodyWrapperGrid: { flex: 1, display: 'grid', gridTemplateColumns: '310px 1fr', overflow: 'hidden', backgroundColor: '#0b141a' },
  waLeftSidebar: { borderRight: '1px solid #222e35', display: 'flex', flexDirection: 'column', backgroundColor: '#111b21', height: '100%', boxSizing: 'border-box' },
  sidebarMetaBanner: { padding: '14px 16px', borderBottom: '1px solid #222e35' },
  sidebarScrollZone: { flex: '1 1 auto', overflowY: 'auto', minHeight: '0' },
  waProfileRowItem: (isActive) => ({ display: 'flex', padding: '14px 16px', cursor: 'pointer', backgroundColor: isActive ? '#202c33' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background-color 0.15s ease', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box', width: '100%' }),
  waRowTitle: { margin: 0, fontSize: '14px', fontWeight: '500', color: '#e9edef' },
  waRowSubtitle: { margin: '3px 0 0 0', fontSize: '12px', color: '#8696a0' },
  waRowBadgeStatus: (status) => ({ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px', backgroundColor: status.toLowerCase() === 'connected' ? 'rgba(0,168,132,0.12)' : status.toLowerCase() === 'initializing' ? 'rgba(224,179,57,0.12)' : 'rgba(242,92,92,0.12)', color: status.toLowerCase() === 'connected' ? '#00a884' : status.toLowerCase() === 'initializing' ? '#e0b339' : '#f25c5c' }),
  sidebarQrFooterZone: { padding: '16px', backgroundColor: '#202c33', borderTop: '1px solid rgba(255,255,255,0.03)', flexShrink: 0, boxSizing: 'border-box' },
  iconActionButton: { background: 'none', border: 'none', fontSize: '12.5px', cursor: 'pointer', outline: 'none', color: '#aebac1', fontWeight: '500' },
  qrGlassHolder: { backgroundColor: 'rgba(17,27,33,0.5)', borderRadius: '8px', padding: '12px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.03)', boxSizing: 'border-box', overflow: 'hidden' },
  qrCanvasWrapper: { backgroundColor: '#fff', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  waContentPanel: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  mainScrollableBody: { flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' },
  studioCardSection: { backgroundColor: '#111b21', borderRadius: '10px', padding: '20px', border: '1px solid #222e35' },
  sectionInnerTitle: { margin: '0 0 2px 0', fontSize: '15px', fontWeight: '500', color: '#e9edef' },
  sectionSubtitleText: { margin: '0 0 14px 0', fontSize: '12.5px', color: '#8696a0' },
  fileUploaderArea: { display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'rgba(32,44,51,0.5)', padding: '12px', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.08)' },
  actionStyledUploadButton: { backgroundColor: '#00a884', color: '#111b21', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'inline-block' },
  columnPillTag: { backgroundColor: 'rgba(83,189,235,0.08)', border: '1px solid rgba(83,189,235,0.18)', color: '#53bdeb', padding: '3px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: '500' },
  waInputStyle: { width: '100%', boxSizing: 'border-box', backgroundColor: 'rgba(42,57,66,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '10px 12px', color: '#fff', fontSize: '13px', outline: 'none' },
  waSelectStyle: { backgroundColor: 'rgba(42,57,66,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '0 10px', fontSize: '13px', outline: 'none' },
  aiAssistDockContainer: { backgroundColor: 'rgba(147,51,234,0.04)', border: '1px solid rgba(147,51,234,0.15)', borderRadius: '8px', padding: '16px' },
  aiActionButtonRun: { width: '100%', backgroundColor: 'rgba(147,51,234,0.15)', color: '#d8b4fe', border: '1px solid rgba(147,51,234,0.25)', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' },
  tokenButtonRack: { display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px', flexWrap: 'wrap' },
  tokenTagItem: { backgroundColor: 'rgba(32,44,51,0.6)', border: '1px solid rgba(255,255,255,0.06)', color: '#53bdeb', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500', flexShrink: 0 },
  compositorSplitWorkspace: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  waTextareaLayout: { width: '100%', height: '130px', backgroundColor: 'rgba(42, 57, 66, 0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '14px', color: '#fff', resize: 'none', outline: 'none', fontSize: '13.5px', lineHeight: '1.5', boxSizing: 'border-box' },
  imageAttachZone: { backgroundColor: 'rgba(32, 44, 51, 0.4)', padding: '12px', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.08)' },
  imageAttachButton: { backgroundColor: '#2a3942', border: '1px solid rgba(255,255,255,0.07)', color: '#e9edef', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', fontWeight: '500', display: 'inline-block' },
  imageRemoveButton: { backgroundColor: 'transparent', border: 'none', color: '#ea0038', cursor: 'pointer', fontSize: '12.5px', fontWeight: '500' },
  imageThumbnailWrapper: { width: '56px', height: '56px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 },
  imageThumbnail: { width: '100%', height: '100%', objectFit: 'cover' },
  waDeviceSimulationPreviewBackground: { backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: 'cover', borderRadius: '8px', border: '1px solid #222e35', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#0b141a', height: '320px' },
  simulationOverlayHeader: { backgroundColor: 'rgba(32, 44, 51, 0.98)', padding: '6px 12px', fontSize: '10px', color: '#8696a0', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(255,255,255,0.02)' },
  waChatBubbleElement: { alignSelf: 'flex-start', backgroundColor: '#005c4b', color: '#e9edef', padding: '10px 12px 6px 12px', borderRadius: '0 8px 8px 8px', maxWidth: '85%', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' },
  waBubbleTimestampContainer: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '6px' },
  bubbleTimestampLabel: { fontSize: '9.5px', color: 'rgba(255,255,255,0.5)' },
  bubbleTicksVector: { fontSize: '10px', color: '#53bdeb', lineHeight: 1 },
  bubbleImageWrapper: { borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' },
  bubbleImage: { width: '100%', display: 'block', maxHeight: '160px', objectFit: 'cover' },
  bubbleCaptionText: { fontSize: '12px', color: 'rgba(255,255,255,0.8)', padding: '6px 4px 2px 4px', lineHeight: '1.4' },
  schedulerWrapperBox: { padding: '16px', backgroundColor: '#111b21', borderRadius: '10px', border: '1px solid #222e35' },
  waCheckboxStyle: { width: '15px', height: '15px', accentColor: '#00a884', cursor: 'pointer' },
  waChronoInput: { backgroundColor: 'rgba(42,57,66,0.4)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '6px 10px', borderRadius: '6px', outline: 'none', fontSize: '13px' },
  inputGroup: { marginBottom: '1.25rem' },
  fieldLabel: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '0.5rem', color: '#8696a0' },
  waPipelineSubmitActionBtn: (active) => ({ width: '100%', padding: '14px', backgroundColor: active ? '#00a884' : '#202c33', color: active ? '#111b21' : '#667781', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: active ? 'pointer' : 'not-allowed', boxShadow: active ? '0 4px 15px rgba(0,168,132,0.15)' : 'none' }),
  footer: { height: '36px', backgroundColor: '#111b21', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11.5px', color: '#8696a0', borderTop: '1px solid #222e35', flexShrink: 0 },
  toastWrapper: { position: 'fixed', bottom: '40px', left: '24px', padding: '12px 20px', borderRadius: '8px', zIndex: 1000, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', backdropFilter: 'blur(10px)' },
  toastTypeStyles: { success: { backgroundColor: '#00a884', color: '#111b21', fontWeight: '600' }, warning: { backgroundColor: '#027eb5', color: '#fff', fontWeight: '500' }, error: { backgroundColor: '#ea0038', color: '#fff', fontWeight: '500' }, info: { backgroundColor: '#202c33', color: '#fff', border: '1px solid rgba(255,255,255,0.05)' } }
};