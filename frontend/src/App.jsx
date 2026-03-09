import React, { useState, useEffect } from 'react';
import {
  Steps,
  Button,
  message,
  Form,
  Input,
  InputNumber,
  Card,
  Typography,
  Row,
  Col,
  List,
  Checkbox,
  Divider,
  Spin,
  Space,
  Tooltip,
  Tag,
  Modal,
  Table,
  Empty,
  ConfigProvider,
  theme,
  Select
} from 'antd';
import {
  DatabaseOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  CloudSyncOutlined,
  RightOutlined,
  LeftOutlined,
  RocketOutlined,
  SyncOutlined,
  SettingOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import ConsoleEditor from './prototype/terminal/ConsoleEditor';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

const API_BASE = 'http://localhost:5000/api';

const App = () => {
  const [mssqlForm] = Form.useForm();
  const [postgresForm] = Form.useForm();

  // ─── Session-Persisted State ───────────────────────────────────────
  const loadSession = (key, fallback) => {
    try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  };

  const [current, setCurrent] = useState(() => loadSession('session_step', 0));
  const [loading, setLoading] = useState(false);
  const [mssqlConfig, setMssqlConfig] = useState(() => loadSession('session_mssql', null));
  const [postgresConfig, setPostgresConfig] = useState(() => loadSession('session_pg', null));

  const [mssqlDBs, setMssqlDBs] = useState([]);
  const [postgresDBs, setPostgresDBs] = useState([]);

  const [routines, setRoutines] = useState(() => loadSession('session_routines', []));
  const [tables, setTables] = useState(() => loadSession('session_tables', []));
  const [targetTables, setTargetTables] = useState(() => loadSession('session_target_tables', []));
  const [selectedTables, setSelectedTables] = useState(() => loadSession('session_selected', []));
  const [selectedRoutine, setSelectedRoutine] = useState(null);
  const [convertedCode, setConvertedCode] = useState('');
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationLogs, setMigrationLogs] = useState(() => loadSession('session_logs', []));
  const [tableTransferStatus, setTableTransferStatus] = useState({}); // { tableName: { status, rows, duration } }

  // Schema Review States
  const [schemaModalVisible, setSchemaModalVisible] = useState(false);
  const [currentSchema, setCurrentSchema] = useState(null);
  const [editedSchemas, setEditedSchemas] = useState({});
  const [reviewLoading, setReviewLoading] = useState(false);
  const [mappingTable, setMappingTable] = useState(null);
  const [mssqlHistory, setMssqlHistory] = useState([]);
  const [pgHistory, setPgHistory] = useState([]);
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [geminiHighlight, setGeminiHighlight] = useState(false);
  const geminiBtnRef = React.useRef(null);
  const [routineExistMap, setRoutineExistMap] = useState({}); // lower-name -> { exists: bool }
  const [highlightRoutineId, setHighlightRoutineId] = useState(null);

  // ─── Persist to sessionStorage on change ────────────────────────────
  useEffect(() => { sessionStorage.setItem('session_step', JSON.stringify(current)); }, [current]);
  useEffect(() => { sessionStorage.setItem('session_mssql', JSON.stringify(mssqlConfig)); }, [mssqlConfig]);
  useEffect(() => { sessionStorage.setItem('session_pg', JSON.stringify(postgresConfig)); }, [postgresConfig]);
  useEffect(() => { sessionStorage.setItem('session_tables', JSON.stringify(tables)); }, [tables]);
  useEffect(() => { sessionStorage.setItem('session_target_tables', JSON.stringify(targetTables)); }, [targetTables]);
  useEffect(() => { sessionStorage.setItem('session_selected', JSON.stringify(selectedTables)); }, [selectedTables]);
  useEffect(() => { sessionStorage.setItem('session_routines', JSON.stringify(routines)); }, [routines]);
  useEffect(() => { sessionStorage.setItem('session_logs', JSON.stringify(migrationLogs.slice(0, 200))); }, [migrationLogs]);

  // ─── Block refresh / navigate-away during active migration ──────────
  useEffect(() => {
    const handler = (e) => {
      if (migrationLoading) {
        e.preventDefault();
        e.returnValue = 'A migration is in progress. Leaving will stop the transfer.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [migrationLoading]);

  // ─── Initial load: history + restore form values ──────────────────────
  useEffect(() => {
    const savedMssql = localStorage.getItem('mssql_history');
    if (savedMssql) setMssqlHistory(JSON.parse(savedMssql));

    const savedPg = localStorage.getItem('pg_history');
    if (savedPg) setPgHistory(JSON.parse(savedPg));

    // Restore form values from session if config exists, else set defaults
    const restoredMssql = loadSession('session_mssql', null);
    const restoredPg = loadSession('session_pg', null);

    if (restoredMssql) {
      mssqlForm.setFieldsValue({ ...restoredMssql, password: '' });
    } else {
      mssqlForm.setFieldsValue({ host: 'localhost', port: 1433, user: 'sa', remember: true });
    }

    if (restoredPg) {
      postgresForm.setFieldsValue({ ...restoredPg, password: '' });
    } else {
      postgresForm.setFieldsValue({ host: 'localhost', port: 5432, user: 'postgres', remember: true });
    }
  }, []);

  // keep gemini key in sync with localStorage
  useEffect(() => {
    setGeminiKey(localStorage.getItem('gemini_api_key') || '');
  }, []);

  // Check whether routines already exist in the target Postgres database (case-insensitive)
  useEffect(() => {
    const checkAll = async () => {
      if (!Array.isArray(routines) || routines.length === 0) return;
      if (!postgresConfig) return; // need target DB to check
      try {
        const names = routines.map(r => r.name || '');
        const res = await axios.post(`${API_BASE}/check-routines-exists`, { config: postgresConfig, names });
        const results = res.data?.results || {};
        const map = {};
        for (const r of routines) {
          const key = (r.name || '').toLowerCase();
          map[key] = { exists: !!results[key] };
        }
        setRoutineExistMap(map);
      } catch (e) {
        // on error, keep existing map
      }
    };

    checkAll();
  }, [routines, postgresConfig]);

  const saveGeminiKey = () => {
    const k = window.prompt('Enter Gemini API key (get one from Google AI Studio):');
    if (k) {
      localStorage.setItem('gemini_api_key', k);
      setGeminiKey(k);
      message.success('Gemini API key saved to localStorage.');
    }
  };

  const removeGeminiKey = () => {
    localStorage.removeItem('gemini_api_key');
    setGeminiKey('');
    message.info('Gemini API key removed.');
  };

  const highlightGeminiControl = () => {
    setGeminiHighlight(true);
    try { geminiBtnRef.current?.focus(); } catch {}
    setTimeout(() => setGeminiHighlight(false), 2200);
  };

  const next = () => setCurrent(current + 1);
  const prev = () => setCurrent(current - 1);
  const goToStep = (step) => {
    if (step < current) setCurrent(step);
  };

  // ─── Vault: WebAuthn + AES-256-GCM ──────────────────────────────────
  const [vaultUnlockVisible, setVaultUnlockVisible] = useState(false);
  const [vaultPinInput, setVaultPinInput] = useState('');
  const [pendingVaultEntry, setPendingVaultEntry] = useState(null);
  const [vaultPinError, setVaultPinError] = useState('');
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [vaultPinConfirm, setVaultPinConfirm] = useState('');
  const [vaultBiometricLoading, setVaultBiometricLoading] = useState(false);

  const toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (hex) => new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  // ── AES-GCM encrypt/decrypt with a raw CryptoKey ──────────────────
  const encryptWithKey = async (text, aesKey) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(text));
    return `${toHex(iv)}:${toHex(enc)}`;
  };

  const decryptWithKey = async (ciphertext, aesKey) => {
    const [ivHex, dataHex] = ciphertext.split(':');
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(ivHex) }, aesKey, fromHex(dataHex));
    return new TextDecoder().decode(dec);
  };

  // ── PIN-based key derivation (fallback) ───────────────────────────
  const deriveKeyFromPin = async (pin, saltHex) => {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromHex(saltHex), iterations: 100000, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  };

  const encryptData = async (text, pin) => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = toHex(salt);
    const key = await deriveKeyFromPin(pin, saltHex);
    return `PIN:${saltHex}:` + await encryptWithKey(text, key);
  };

  const decryptData = async (ciphertext, pin) => {
    const parts = ciphertext.split(':');
    const saltHex = parts[1];
    const rest = parts.slice(2).join(':');
    const key = await deriveKeyFromPin(pin, saltHex);
    return decryptWithKey(rest, key);
  };

  // ── WebAuthn vault key management ─────────────────────────────────
  const webAuthnAvailable = async () => {
    try {
      return !!(window.PublicKeyCredential &&
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch { return false; }
  };

  const vaultHasBiometric = () => !!localStorage.getItem('vault_cred_id');
  const vaultHasPin = () => !!localStorage.getItem('vault_pin_check');

  // Generate and store a random vault AES key
  const generateVaultKey = async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const raw = await crypto.subtle.exportKey('raw', key);
    localStorage.setItem('vault_aes_key', toHex(raw));
    return key;
  };

  const loadVaultKey = async () => {
    const hex = localStorage.getItem('vault_aes_key');
    if (!hex) return null;
    return crypto.subtle.importKey('raw', fromHex(hex), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  };

  // Register a platform authenticator (Windows Hello, Touch ID, etc.)
  const registerBiometric = async () => {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
          rp: { name: 'procly Vault', id: window.location.hostname },
          user: { id: userId, name: 'vault-user', displayName: 'procly Vault' },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
      }
    });
    localStorage.setItem('vault_cred_id', toB64(cred.rawId));
    return generateVaultKey();
  };

  // Trigger biometric auth and return the vault AES key on success
  const authenticateBiometric = async () => {
    const credIdB64 = localStorage.getItem('vault_cred_id');
    if (!credIdB64) return null;
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: fromB64(credIdB64), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      }
    });
    return loadVaultKey();
  };

  // ── Encrypt & save with biometric key ─────────────────────────────
  const saveWithBiometricKey = async (entry, type, aesKey) => {
    const histKey = type === 'mssql' ? 'mssql_history' : 'pg_history';
    const setter = type === 'mssql' ? setMssqlHistory : setPgHistory;
    const currentHist = JSON.parse(localStorage.getItem(histKey) || '[]');
    const encryptedPassword = await encryptWithKey(entry.password, aesKey);
    const entryToStore = { ...entry, password: undefined, encryptedPassword, vaultType: 'biometric' };
    const filtered = currentHist.filter(h => h.host !== entry.host || h.database !== entry.database);
    const newHist = [entryToStore, ...filtered].slice(0, 8);
    setter(newHist);
    localStorage.setItem(histKey, JSON.stringify(newHist));
  };

  const saveEncryptedEntry = async (pin) => {
    const { entry, type } = pendingVaultEntry;
    const histKey = type === 'mssql' ? 'mssql_history' : 'pg_history';
    const setter = type === 'mssql' ? setMssqlHistory : setPgHistory;
    const currentHist = JSON.parse(localStorage.getItem(histKey) || '[]');
    const encryptedPassword = await encryptData(entry.password, pin);
    const entryToStore = { ...entry, password: undefined, encryptedPassword, vaultType: 'pin' };
    const filtered = currentHist.filter(h => h.host !== entry.host || h.database !== entry.database);
    const newHist = [entryToStore, ...filtered].slice(0, 8);
    setter(newHist);
    localStorage.setItem(histKey, JSON.stringify(newHist));
  };

  // ── Open vault entry: try biometric first, fallback to PIN ─────────
  const openVaultEntry = async (entry, type) => {
    if (!entry.encryptedPassword) {
      const form = type === 'mssql' ? mssqlForm : postgresForm;
      form.setFieldsValue(entry);
      return;
    }
    // Try biometric path
    if (entry.vaultType !== 'pin' && vaultHasBiometric()) {
      setVaultBiometricLoading(true);
      try {
        const aesKey = await authenticateBiometric();
        if (aesKey) {
          const password = await decryptWithKey(entry.encryptedPassword, aesKey);
          const form = type === 'mssql' ? mssqlForm : postgresForm;
          form.setFieldsValue({ ...entry, password });
          message.success('🔓 Credentials unlocked via biometric');
          setVaultBiometricLoading(false);
          return;
        }
      } catch (e) {
        // User cancelled or biometric failed — fall through to PIN modal
      }
      setVaultBiometricLoading(false);
    }
    // Fallback: PIN modal
    setPendingVaultEntry({ entry, type });
    setVaultPinInput('');
    setVaultPinConfirm('');
    setVaultPinError('');
    setIsSettingPin(!vaultHasPin());
    setVaultUnlockVisible(true);
  };

  const handleVaultUnlock = async () => {
    if (isSettingPin) {
      if (vaultPinInput.length < 4) { setVaultPinError('PIN must be at least 4 characters'); return; }
      if (vaultPinInput !== vaultPinConfirm) { setVaultPinError('PINs do not match'); return; }
      // Store PIN verification token
      const token = await encryptData('VAULT_OK', vaultPinInput);
      localStorage.setItem('vault_pin_check', token);
      if (pendingVaultEntry?.isSaving) {
        await saveEncryptedEntry(vaultPinInput);
        message.success('Vault PIN set & credentials secured');
      } else {
        message.success('Vault PIN set successfully');
      }
      setVaultUnlockVisible(false);
      return;
    }
    // Verify PIN
    try {
      const token = localStorage.getItem('vault_pin_check');
      const result = await decryptData(token, vaultPinInput);
      if (result !== 'VAULT_OK') throw new Error();
    } catch {
      setVaultPinError('Incorrect PIN. Try again.');
      return;
    }
    if (pendingVaultEntry?.isSaving) {
      await saveEncryptedEntry(vaultPinInput);
      setVaultUnlockVisible(false);
      message.success('Credentials secured in vault');
      return;
    }
    try {
      const { entry, type } = pendingVaultEntry;
      const password = await decryptData(entry.encryptedPassword, vaultPinInput);
      const form = type === 'mssql' ? mssqlForm : postgresForm;
      form.setFieldsValue({ ...entry, password });
      setVaultUnlockVisible(false);
      message.success('Credentials loaded from vault');
    } catch {
      setVaultPinError('Failed to decrypt — incorrect PIN.');
    }
  };

  const addToHistory = async (type, values) => {
    if (!values.remember) return;
    const histKey = type === 'mssql' ? 'mssql_history' : 'pg_history';
    const setter = type === 'mssql' ? setMssqlHistory : setPgHistory;
    const currentHist = type === 'mssql' ? mssqlHistory : pgHistory;

    let entryToStore = { ...values, password: undefined };

    if (values.password) {
      // Silently encrypt password with the vault AES key (no biometrics at this step)
      // Generate vault key if it doesn't exist yet
      let aesKey = await loadVaultKey();
      if (!aesKey) {
        aesKey = await generateVaultKey();
      }
      try {
        const encryptedPassword = await encryptWithKey(values.password, aesKey);
        entryToStore = { ...values, password: undefined, encryptedPassword, vaultType: 'biometric' };
      } catch {
        // If encryption fails for any reason, store without password
      }
    }

    const filtered = currentHist.filter(h => h.host !== values.host || h.database !== values.database);
    const newHist = [entryToStore, ...filtered].slice(0, 8);
    setter(newHist);
    localStorage.setItem(histKey, JSON.stringify(newHist));
  };


  const fetchMssqlDBs = async () => {
    const values = mssqlForm.getFieldsValue();
    if (!values.host || !values.user || !values.password) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/list-databases-mssql`, values);
      setMssqlDBs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPostgresDBs = async () => {
    const values = postgresForm.getFieldsValue();
    if (!values.host || !values.user || !values.password) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/list-databases-postgres`, values);
      setPostgresDBs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMssqlConnect = async (values) => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/check-connection-mssql`, values);
      message.success('Connected to MSSQL successfully!');
      setMssqlConfig(values);
      addToHistory('mssql', values);
      next();
    } catch (err) {
      message.error(err.response?.data?.error || 'Connection failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handlePostgresConnect = async (values) => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/check-connection-postgres`, values);
      message.success('Connected to PostgreSQL successfully!');
      setPostgresConfig(values);
      addToHistory('pg', values);

      // Fetch routines and tables from MSSQL
      const routinesRes = await axios.post(`${API_BASE}/mssql/routines`, mssqlConfig);
      setRoutines(routinesRes.data);

      const tablesRes = await axios.post(`${API_BASE}/mssql/tables`, mssqlConfig);
      setTables(tablesRes.data);

      // Fetch existing tables from Postgres
      try {
        const targetTablesRes = await axios.post(`${API_BASE}/postgres/tables`, values);
        setTargetTables(targetTablesRes.data);
      } catch (e) {
        console.error("Failed to fetch target tables", e);
      }

      next();
    } catch (err) {
      message.error(err.response?.data?.error || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setMigrationLogs(prev => [{ timestamp: time, message: msg, type }, ...prev]);
  };

  const handleCreateSchemas = async () => {
    if (selectedTables.length === 0) {
      message.warning('Please select at least one table');
      return;
    }
    setMigrationLoading(true);
    addLog(`Starting schema creation for ${selectedTables.length} tables...`, 'info');

    // Filter out tables that already exist for schema creation
    const tablesToCreate = selectedTables.filter(t => {
      const baseName = t.split('.').pop().toLowerCase();
      return !targetTables.includes(baseName);
    });

    if (tablesToCreate.length === 0 && selectedTables.length > 0) {
      addLog("All selected tables already exist in target. Skipping schema sync.", "info");
    }

    for (const table of tablesToCreate) {
      try {
        addLog(`Creating schema for ${table}...`, 'info');
        await axios.post(`${API_BASE}/migrate/schema`, {
          source: mssqlConfig,
          target: postgresConfig,
          table: table,
          schema: editedSchemas[table] || { columns: [] }
        });
        addLog(`Successfully created/verified schema for ${table}`, 'success');
      } catch (err) {
        addLog(`Failed to create schema for ${table}: ${err.response?.data?.error || err.message}`, 'error');
      }
    }

    // Refresh existing tables from Postgres
    try {
      const targetTablesRes = await axios.post(`${API_BASE}/postgres/tables`, postgresConfig);
      setTargetTables(targetTablesRes.data);
    } catch (e) {
      addLog("Failed to refresh target tables status", "error");
    }

    setMigrationLoading(false);
    message.success('Schema synchronization complete');
  };

  const handleMigrateData = async () => {
    if (selectedTables.length === 0) {
      message.warning('Please select at least one table');
      return;
    }
    setMigrationLoading(true);

    // Initialize all tables as QUEUED
    const initStatus = {};
    selectedTables.forEach(t => { initStatus[t] = { status: 'queued', rows: 0, duration: 0 }; });
    setTableTransferStatus(initStatus);
    addLog(`Starting data migration for ${selectedTables.length} tables...`, 'info');

    try {
      for (const table of selectedTables) {
        const startTime = Date.now();
        setTableTransferStatus(prev => ({ ...prev, [table]: { ...prev[table], status: 'migrating' } }));
        addLog(`Migrating data for ${table}...`, 'info');
        try {
          const res = await axios.post(`${API_BASE}/migrate/data`, {
            source: mssqlConfig,
            target: postgresConfig,
            table: table
          });
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          const rows = res.data.rows || 0;
          setTableTransferStatus(prev => ({ ...prev, [table]: { status: 'done', rows, duration } }));
          addLog(`✓ ${table}: ${rows.toLocaleString()} rows in ${duration}s`, 'success');
        } catch (err) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          setTableTransferStatus(prev => ({ ...prev, [table]: { status: 'error', rows: 0, duration } }));
          addLog(`✗ ${table}: ${err.response?.data?.error || err.message}`, 'error');
        }
      }
    } finally {
      setMigrationLoading(false);
      message.success('Data migration tasks complete');
    }
  };

  const fetchTableSchema = async (tableName) => {
    setReviewLoading(true);
    setMappingTable(tableName);
    try {
      const res = await axios.post(`${API_BASE}/mssql/table-schema`, {
        config: mssqlConfig,
        table: tableName
      });
      setCurrentSchema(res.data);
    } catch (err) {
      message.error("Failed to fetch schema details");
    } finally {
      setReviewLoading(false);
    }
  };

  const saveSchemaChanges = () => {
    setEditedSchemas({
      ...editedSchemas,
      [currentSchema.tableName]: currentSchema
    });
    setSchemaModalVisible(false);
    message.success(`Custom schema saved for ${currentSchema.tableName}`);
  };

  const handleConvert = async (routine) => {
    setLoading(true);
    // Prevent generation if routine already exists on target
    if (routine && routineExistMap[routine.name?.toLowerCase()]?.exists) {
      message.warning('This routine already exists on the target; generation is disabled.');
      setLoading(false);
      return;
    }
    addLog(`AI conversion started for ${routine?.name || 'unnamed'}`, 'info');
    if (!geminiKey) {
      highlightGeminiControl();
      message.warning('Please set your Gemini API key first (click "Set Key").');
      addLog('AI conversion blocked: missing Gemini API key', 'error');
      setLoading(false);
      return;
    }
    try {
      const headers = {};
      if (geminiKey) headers['X-Gemini-Key'] = geminiKey;
      const res = await axios.post(`${API_BASE}/convert`, {
        sourceCode: routine.code,
        type: routine.type
      }, { headers });
      setConvertedCode(res.data.convertedCode);
      addLog('AI conversion complete', 'success');
      message.success('AI Conversion complete!');
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      addLog('AI conversion failed: ' + errMsg, 'error');
      message.error('Conversion failed: ' + errMsg);
    } finally {
      setLoading(false);
    }
  };

  const selectRoutine = async (item) => {
    setSelectedRoutine(item);
    setConvertedCode('');
    // If target exists and routine exists there, fetch definition automatically
    try {
      if (postgresConfig && routineExistMap[item.name?.toLowerCase()]?.exists) {
        addLog(`Fetching converted routine from target for ${item.name}`, 'info');
        const res = await axios.post(`${API_BASE}/postgres/routine-source`, { config: postgresConfig, name: item.name });
        setConvertedCode(res.data.definition || '-- no definition returned --');
        addLog('Loaded converted routine from target', 'success');
      }
    } catch (e) {
      addLog('Failed to load converted routine from target: ' + (e.response?.data?.error || e.message), 'error');
    }
  };

  const handleDeploy = async () => {
    if (!convertedCode || !postgresConfig) {
      message.warning('Please convert the code first.');
      return;
    }
    setLoading(true);
    try {
      // Determine routine name: prefer selectedRoutine.name, otherwise ask user
      let routineName = selectedRoutine?.name;
      if (!routineName) {
        routineName = window.prompt('Enter routine name to check (e.g. my_function):');
      }
      if (routineName) {
        const chk = await axios.post(`${API_BASE}/check-routine-exists`, { config: postgresConfig, name: routineName });
        if (chk.data && chk.data.exists) {
          // Ask user to confirm overwrite
          const { confirm } = Modal || {};
          let proceed = false;
          await new Promise((resolve) => {
            Modal.confirm({
              title: 'Routine exists',
              content: `A routine named "${routineName}" already exists in the target database. Overwrite it?`,
              okText: 'Overwrite',
              cancelText: 'Cancel',
              onOk() { proceed = true; resolve(null); },
              onCancel() { resolve(null); }
            });
          });
          if (!proceed) {
            setLoading(false);
            return;
          }
        }
      }

      addLog(`Deploying routine ${routineName || selectedRoutine?.name || 'unnamed'} to target`, 'info');
      const execRes = await axios.post(`${API_BASE}/execute-postgres`, {
        config: postgresConfig,
        sql: convertedCode
      });
      addLog('Deployment succeeded: ' + (execRes.data?.message || ''), 'success');
      message.success('Successfully deployed to PostgreSQL!');
      // Refresh authoritative existence statuses from server (someone else may have modified DB)
      try {
        const names = routines.map(r => r.name || '');
        const res = await axios.post(`${API_BASE}/check-routines-exists`, { config: postgresConfig, names });
        const results = res.data?.results || {};
        const map = {};
        for (const r of routines) {
          const key = (r.name || '').toLowerCase();
          map[key] = { exists: !!results[key] };
        }
        setRoutineExistMap(map);

        // highlight deployed routine if present
        const nameKey = (routineName || selectedRoutine?.name || '').toLowerCase();
        const found = routines.find(r => (r.name || '').toLowerCase() === nameKey);
        const idToHighlight = found?.id || selectedRoutine?.id;
        if (idToHighlight) {
          setHighlightRoutineId(idToHighlight);
          setTimeout(() => setHighlightRoutineId(null), 2200);
        }
      } catch (e) {
        // ignore
      }
    } catch (err) {
      const serverData = err.response?.data;
      let errMsg = err.response?.data?.error || err.message;
      // If pq details available, build a richer message
      if (serverData?.pq) {
        const pq = serverData.pq;
        errMsg = `${pq.message || serverData.error} ${pq.detail ? '\nDetail: ' + pq.detail : ''} ${pq.hint ? '\nHint: ' + pq.hint : ''} ${pq.position ? '\nPosition: ' + pq.position : ''}`;
      }
      addLog('Deployment failed: ' + errMsg, 'error');
      // Show modal with actions: Regenerate (re-run convert) or Close
      Modal.confirm({
        title: 'Deployment failed',
        content: (<div><pre style={{ whiteSpace: 'pre-wrap' }}>{errMsg}</pre></div>),
        okText: 'Regenerate',
        cancelText: 'Close',
        onOk() { if (selectedRoutine) handleConvert(selectedRoutine); }
      });
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      title: 'Source MSSQL',
      description: 'System Credentials',
      icon: <DatabaseOutlined />,
      content: (
        <div key="mssql-step-wrapper" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Row gutter={40} style={{ flex: 1, minHeight: 0 }}>
            <Col span={7} style={{ borderRight: '1px solid var(--muted-border)', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, opacity: 0.5, fontWeight: 800, letterSpacing: '0.1em', marginBottom: 12 }}>CONNECTION VAULT</div>
                <div style={{ color: 'var(--muted-text)', fontSize: 12 }}>Select a previously established handshake to auto-fill credentials.</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }} className="sidebar-list">
                {mssqlHistory.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', opacity: 0.4, border: '1px dashed var(--muted-border)', borderRadius: 6 }}>
                    <DatabaseOutlined style={{ fontSize: 24, marginBottom: 8 }} />
                    <div style={{ fontSize: 11 }}>No established connections found</div>
                  </div>
                ) : (
                  mssqlHistory.map((h, i) => (
                    <div
                      key={i}
                      className="history-item-large"
                      onClick={() => openVaultEntry(h, 'mssql')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="history-icon"><DatabaseOutlined /></div>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{h.database}</div>
                          <div style={{ fontSize: 11, opacity: 0.6, textOverflow: 'ellipsis', overflow: 'hidden' }}>{h.user}@{h.host}:{h.port}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Col>
            <Col span={17} style={{ paddingTop: '20px' }}>
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <DatabaseOutlined style={{ color: 'var(--accent)' }} /> <span>CONNECT SOURCE (MSSQL)</span>
                </div>
                <div style={{ color: 'var(--muted-text)', fontSize: 13, marginTop: 4 }}>Establish a secure handshake with the primary SQL Server.</div>
              </div>

              <Form form={mssqlForm} name="mssql_form" layout="vertical" onFinish={handleMssqlConnect} requiredMark={false} style={{ maxWidth: 600 }}>
                <Row gutter={16}>
                  <Col span={18}>
                    <Form.Item name="host" label="HOST ADDRESS" rules={[{ required: true }]}>
                      <Input placeholder="e.g. 192.168.1.1 or localhost" autoComplete="off" />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item name="port" label="PORT" rules={[{ required: true }]}>
                      <InputNumber style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="user" label="USERNAME" rules={[{ required: true }]}>
                      <Input placeholder="sa" autoComplete="off" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="password" label="PASSWORD" rules={[{ required: true }]}>
                      <Input.Password placeholder="••••••••" onBlur={fetchMssqlDBs} autoComplete="new-password" />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="database" label="ACTIVE DATABASE" rules={[{ required: true }]}>
                  <Select placeholder="Target catalog..." loading={loading} showSearch onFocus={fetchMssqlDBs}>
                    {mssqlDBs.map(db => <Option key={db} value={db}>{db}</Option>)}
                  </Select>
                </Form.Item>

                <Form.Item name="remember" valuePropName="checked">
                  <Checkbox>Remember secure credentials locally</Checkbox>
                </Form.Item>
              </Form>
            </Col>
          </Row>
        </div>
      ),
      actions: (
        <>
          <div />
          <button
            onClick={() => mssqlForm.submit()}
            className="btn primary"
            style={{ width: '240px' }}
            disabled={loading}
          >
            {loading ? <SyncOutlined spin /> : <DatabaseOutlined />} INITIALIZE HANDSHAKE
          </button>
        </>
      )
    },
    {
      title: 'Target Postgres',
      description: 'Cloud Credentials',
      icon: <CloudSyncOutlined />,
      content: (
        <div key="postgres-step-wrapper" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Row gutter={40} style={{ flex: 1, minHeight: 0 }}>
            <Col span={7} style={{ borderRight: '1px solid var(--muted-border)', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, opacity: 0.5, fontWeight: 800, letterSpacing: '0.1em', marginBottom: 12 }}>CONNECTION VAULT</div>
                <div style={{ color: 'var(--muted-text)', fontSize: 12 }}>Configure the destination environment for deployment.</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }} className="sidebar-list">
                {pgHistory.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', opacity: 0.4, border: '1px dashed var(--muted-border)', borderRadius: 6 }}>
                    <CloudSyncOutlined style={{ fontSize: 24, marginBottom: 8 }} />
                    <div style={{ fontSize: 11 }}>No established targets found</div>
                  </div>
                ) : (
                  pgHistory.map((h, i) => (
                    <div
                      key={i}
                      className="history-item-large"
                      onClick={() => openVaultEntry(h, 'pg')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="history-icon" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#86efac' }}><CloudSyncOutlined /></div>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{h.database}</div>
                          <div style={{ fontSize: 11, opacity: 0.6, textOverflow: 'ellipsis', overflow: 'hidden' }}>{h.user}@{h.host}:{h.port}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Col>
            <Col span={17} style={{ paddingTop: '20px' }}>
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <CloudSyncOutlined style={{ color: '#86efac' }} /> <span>CONNECT TARGET (POSTGRES)</span>
                </div>
                <div style={{ color: 'var(--muted-text)', fontSize: 13, marginTop: 4 }}>Configure the destination environment for deployment.</div>
              </div>

              <Form form={postgresForm} name="postgres_form" layout="vertical" onFinish={handlePostgresConnect} requiredMark={false} style={{ maxWidth: 600 }}>
                <Row gutter={16}>
                  <Col span={18}>
                    <Form.Item name="host" label="SERVER ADDRESS" rules={[{ required: true }]}>
                      <Input placeholder="e.g. pg.cloud.internal or localhost" autoComplete="off" />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item name="port" label="PORT" rules={[{ required: true }]}>
                      <InputNumber style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="user" label="USERNAME" rules={[{ required: true }]}>
                      <Input placeholder="postgres" autoComplete="off" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="password" label="PASSWORD" rules={[{ required: true }]}>
                      <Input.Password placeholder="••••••••" onBlur={fetchPostgresDBs} autoComplete="new-password" />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="database" label="ACTIVE DATABASE" rules={[{ required: true }]}>
                  <Select placeholder="Destination catalog..." loading={loading} showSearch onFocus={fetchPostgresDBs}>
                    {postgresDBs.map(db => <Option key={db} value={db}>{db}</Option>)}
                  </Select>
                </Form.Item>

                <Form.Item name="remember" valuePropName="checked">
                  <Checkbox>Remember secure credentials locally</Checkbox>
                </Form.Item>
              </Form>
            </Col>
          </Row>
        </div>
      ),
      actions: (
        <>
          <button className="btn" onClick={prev} disabled={migrationLoading}><LeftOutlined /> BACK</button>
          <button
            onClick={() => postgresForm.submit()}
            className="btn primary"
            style={{ width: '240px' }}
            disabled={loading}
          >
            {loading ? <SyncOutlined spin /> : <CloudSyncOutlined />} ESTABLISH TARGET SYNC
          </button>
        </>
      )
    },
    {
      title: 'Schema Sync',
      description: 'Create Tables',
      icon: <CheckCircleOutlined />,
      content: (
        <div key="migration-step-wrapper" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Row gutter={16} style={{ flex: 1, minHeight: 0 }}>
            <Col span={10} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>SCHEMA & DATA ORCHESTRATION</div>
                <Checkbox
                  onChange={(e) => setSelectedTables(e.target.checked ? tables.map(t => t.name) : [])}
                  checked={selectedTables.length === tables.length && tables.length > 0}
                  style={{ fontSize: 11 }}
                >
                  ALL ({tables.length})
                </Checkbox>
              </div>

              <div className="table-selector" style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--muted-border)', borderRadius: 6 }}>
                <Checkbox.Group
                  onChange={setSelectedTables}
                  value={selectedTables}
                  style={{ display: 'flex', flexDirection: 'column', width: '100%' }}
                >
                  {Array.isArray(tables) && tables.map(t => {
                    const baseName = t.name.split('.').pop().toLowerCase();
                    const exists = Array.isArray(targetTables) && targetTables.some(tt => tt.toLowerCase() === baseName);

                    return (
                      <div
                        key={t.name}
                        className={`term-step ${mappingTable === t.name ? 'active' : ''} ${exists ? 'exists' : ''}`}
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--muted-border)',
                          borderRadius: 0,
                          opacity: exists ? 0.7 : 1,
                          background: exists ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                        }}
                        onClick={() => fetchTableSchema(t.name)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Checkbox
                            value={t.name}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {t.name}
                              {t.type === 'VIEW' && <Tag color="purple" style={{ margin: 0, fontSize: 8, height: 14, lineHeight: '12px', padding: '0 4px' }}>VIEW</Tag>}
                              {exists && <Tag color="blue" style={{ margin: 0, borderRadius: '4px', fontSize: 8, height: 14, lineHeight: '12px' }}>ALREADY IN TARGET</Tag>}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--muted-text)' }}>{t.type === 'VIEW' ? 'Virtual Table' : `${t.rows || 0} rows`}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Checkbox.Group>
              </div>
            </Col>

            <Col span={14} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 16 }}>
                VERIFY MAPPING: {mappingTable || '---'}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--muted-border)', borderRadius: 6, padding: '16px' }}>
                {reviewLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                    <Spin tip="Analyzing deep structure..." />
                  </div>
                ) : currentSchema && currentSchema.tableName === mappingTable ? (
                  <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <div>
                      <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12, fontSize: 11, letterSpacing: '0.05em' }}>PROPOSED SCHEMA MAPPING</div>
                      <Table
                        dataSource={currentSchema.columns}
                        pagination={false}
                        size="small"
                        className="mapping-table"
                        columns={[
                          {
                            title: 'COL',
                            dataIndex: 'name',
                            key: 'name',
                            width: '25%',
                            render: (text, record) => (
                              <Space>
                                {record.isPK && <Tag className="pk-tag">PK</Tag>}
                                <span style={{ color: '#fff', fontWeight: 500 }}>{text}</span>
                              </Space>
                            )
                          },
                          {
                            title: 'SOURCE (MSSQL)',
                            dataIndex: 'dataType',
                            key: 'dataType',
                            width: '25%',
                            render: (val, record) => (
                              <div style={{ color: 'var(--muted-text)', fontSize: 11, fontFamily: 'monospace' }}>
                                {val.toUpperCase()}{record.maxLength > 0 && record.maxLength < 32000 ? `(${record.maxLength})` : val.includes('char') || val.includes('binary') ? '(MAX)' : ''}
                                {record.isNullable ? '' : <span style={{ color: '#f87171', marginLeft: 4 }}>*</span>}
                              </div>
                            )
                          },
                          {
                            title: 'TARGET (POSTGRES)',
                            dataIndex: 'pgType',
                            key: 'pgType',
                            render: (val, record, index) => (
                              <Input
                                value={val}
                                size="small"
                                className="terminal-input-small"
                                onChange={(e) => {
                                  const newCols = [...currentSchema.columns];
                                  newCols[index].pgType = e.target.value;
                                  setCurrentSchema({ ...currentSchema, columns: newCols });
                                  setEditedSchemas({ ...editedSchemas, [currentSchema.tableName]: { ...currentSchema, columns: newCols } });
                                }}
                              />
                            )
                          },
                          {
                            title: 'DEFAULT',
                            dataIndex: 'defaultValue',
                            key: 'defaultValue',
                            width: '15%',
                            render: (v) => <span style={{ opacity: 0.6, fontSize: 10 }}>{v || '-'}</span>
                          }
                        ]}
                      />
                    </div>

                    {currentSchema.indexes && currentSchema.indexes.length > 0 && (
                      <div>
                        <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12, fontSize: 11, letterSpacing: '0.05em' }}>INDEXES (READ-ONLY)</div>
                        <Table
                          dataSource={currentSchema.indexes}
                          pagination={false}
                          size="small"
                          columns={[
                            { title: 'NAME', dataIndex: 'name', key: 'name' },
                            { title: 'COLUMNS', dataIndex: 'columns', key: 'columns' },
                            {
                              title: 'TYPE',
                              key: 'type',
                              render: (_, r) => (
                                <Tag color={r.isPrimary ? 'gold' : r.isUnique ? 'blue' : 'default'} style={{ fontSize: 9 }}>
                                  {r.isPrimary ? 'PRIMARY' : r.isUnique ? 'UNIQUE' : 'INDEX'}
                                </Tag>
                              )
                            }
                          ]}
                        />
                      </div>
                    )}

                    {currentSchema.foreignKeys && currentSchema.foreignKeys.length > 0 && (
                      <div>
                        <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12, fontSize: 11, letterSpacing: '0.05em' }}>RELATIONSHIPS (FK)</div>
                        <Table
                          dataSource={currentSchema.foreignKeys}
                          pagination={false}
                          size="small"
                          columns={[
                            { title: 'SOURCE COL', dataIndex: 'columnName', key: 'columnName' },
                            { title: 'REF TABLE', dataIndex: 'refTable', key: 'refTable' },
                            { title: 'REF COL', dataIndex: 'refColumn', key: 'refColumn' }
                          ]}
                        />
                      </div>
                    )}
                  </Space>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--muted-text)', textAlign: 'center' }}>
                    <div>
                      <InfoCircleOutlined style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }} />
                      <div>SELECT A TABLE TO INSPECT<br />ARCHITECTURAL METADATA</div>
                    </div>
                  </div>
                )}
              </div>
            </Col>
          </Row>
        </div>
      ),
      actions: (
        <>
          <button className="btn" onClick={prev} disabled={migrationLoading}><LeftOutlined /> BACK</button>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="btn primary"
              style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#86efac', border: '1px solid rgba(34, 197, 94, 0.4)' }}
              onClick={handleCreateSchemas}
              disabled={migrationLoading || selectedTables.length === 0}
            >
              {migrationLoading ? <SyncOutlined spin /> : <CheckCircleOutlined />} SYNC SCHEMAS
            </button>
            <button className="btn primary" onClick={next} disabled={migrationLoading}>
              NEXT: DATA TRANSFER <RightOutlined />
            </button>
          </div>
        </>
      )
    },
    {
      title: 'Data Transfer',
      description: 'Row Migration',
      icon: <RocketOutlined />,
      content: (
        <div key="transfer-step-wrapper" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Row gutter={16} style={{ flex: 1, minHeight: 0 }}>
            <Col span={10} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>SELECT TABLES TO TRANSFER</div>
                <Checkbox
                  onChange={(e) => setSelectedTables(e.target.checked ? tables.map(t => t.name) : [])}
                  checked={selectedTables.length === tables.length && tables.length > 0}
                  style={{ fontSize: 11 }}
                >
                  ALL ({tables.length})
                </Checkbox>
              </div>

              <div className="table-selector" style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--muted-border)', borderRadius: 6 }}>
                <Checkbox.Group
                  onChange={setSelectedTables}
                  value={selectedTables}
                  style={{ display: 'flex', flexDirection: 'column', width: '100%' }}
                >
                  {Array.isArray(tables) && tables.filter(t => t.type !== 'VIEW').map(t => {
                    const baseName = t.name.split('.').pop().toLowerCase();
                    const exists = Array.isArray(targetTables) && targetTables.some(tt => tt.toLowerCase() === baseName);
                    return (
                      <div
                        key={t.name}
                        className={`term-step ${selectedTables.includes(t.name) ? 'active' : ''}`}
                        style={{ padding: '8px 12px', borderBottom: '1px solid var(--muted-border)', borderRadius: 0 }}
                        onClick={() => {
                          setSelectedTables(prev =>
                            prev.includes(t.name) ? prev.filter(x => x !== t.name) : [...prev, t.name]
                          );
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Checkbox value={t.name} onClick={(e) => e.stopPropagation()} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {t.name}
                              {!exists && <Tag color="orange" style={{ margin: 0, borderRadius: '4px', fontSize: 8, height: 14, lineHeight: '12px' }}>SCHEMA MISSING</Tag>}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--muted-text)' }}>{t.rows || 0} source rows</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Checkbox.Group>
              </div>
            </Col>

            <Col span={14} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 16 }}>DATA TRANSFER STATUS</div>
              <div style={{ flex: 1, background: 'var(--panel)', border: '1px solid var(--muted-border)', borderRadius: 6, padding: '16px', overflowY: 'auto' }}>
                {selectedTables.length === 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--muted-text)', textAlign: 'center' }}>
                    <div>
                      <RocketOutlined style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }} />
                      <div style={{ fontSize: 13, marginBottom: 8 }}>SELECT TABLES TO BEGIN</div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>Only tables with a matching schema in the target<br />can be populated with data.</div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ color: 'var(--muted-text)', fontSize: 11, marginBottom: 16, letterSpacing: '0.05em', fontWeight: 700 }}>
                      TRANSFER QUEUE — {selectedTables.length} TABLES
                    </div>
                    {selectedTables.map((t, i) => {
                      const ts = tableTransferStatus[t];
                      const status = ts?.status || 'queued';
                      const statusConfig = {
                        queued: { color: 'default', label: 'QUEUED', icon: null },
                        migrating: { color: 'processing', label: 'MIGRATING', icon: <SyncOutlined spin style={{ fontSize: 10 }} /> },
                        done: { color: 'success', label: 'DONE', icon: <CheckCircleOutlined style={{ fontSize: 10 }} /> },
                        error: { color: 'error', label: 'FAILED', icon: null },
                      };
                      const cfg = statusConfig[status] || statusConfig.queued;
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 0', borderBottom: '1px solid var(--muted-border)', fontSize: 12,
                          background: status === 'migrating' ? 'rgba(125, 211, 252, 0.03)' : 'transparent',
                          transition: 'background 0.3s'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <span style={{ color: status === 'done' ? '#86efac' : status === 'error' ? '#f87171' : '#fff', fontFamily: 'monospace' }}>
                              {t}
                            </span>
                            {ts && ts.status !== 'queued' && (
                              <span style={{ fontSize: 10, color: 'var(--muted-text)', marginTop: 2 }}>
                                {ts.status === 'done' && `${ts.rows.toLocaleString()} rows · ${ts.duration}s`}
                                {ts.status === 'error' && `Failed after ${ts.duration}s`}
                                {ts.status === 'migrating' && 'Transferring rows...'}
                              </span>
                            )}
                          </div>
                          <Tag
                            color={cfg.color}
                            icon={cfg.icon}
                            style={{ fontSize: 10, flexShrink: 0 }}
                          >
                            {cfg.label}
                          </Tag>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Col>
          </Row>
        </div>
      ),
      actions: (
        <>
          <button className="btn" onClick={prev} disabled={migrationLoading}><LeftOutlined /> BACK</button>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="btn primary"
              onClick={handleMigrateData}
              disabled={migrationLoading || selectedTables.length === 0}
            >
              {migrationLoading ? <SyncOutlined spin /> : <RocketOutlined />} START DATA TRANSFER
            </button>
            <button className="btn" onClick={next} disabled={migrationLoading}>SKIP TO LOGIC <RightOutlined /></button>
          </div>
        </>
      )
    },
    {
      title: 'Logic Conversion',
      description: 'Functions & Procs',
      icon: <CodeOutlined />,
      content: (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Row gutter={16} style={{ flex: 1, minHeight: 0 }}>
            <Col span={6} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '0 0 12px 0', borderBottom: '1px solid var(--muted-border)', marginBottom: 12 }}>
                <Text strong style={{ color: '#fff' }}>ROUTINES ({routines.length})</Text>
              </div>
              <div className="sidebar-list" style={{ flex: 1, overflowY: 'auto' }}>
                {/* Functions */}
                <div style={{ marginBottom: 8 }}>
                  <Text strong style={{ color: '#fff' }}>Functions ({routines.filter(r => r.type === 'FUNCTION').length})</Text>
                </div>
                <List
                  dataSource={routines.filter(r => r.type === 'FUNCTION')}
                  renderItem={item => {
                    const exists = routineExistMap[item.name?.toLowerCase()]?.exists;
                    const isActive = selectedRoutine?.id === item.id;
                    const isHighlighted = highlightRoutineId === item.id;
                    const itemStyle = {
                      padding: '8px 10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'box-shadow 200ms, transform 120ms',
                      boxShadow: isHighlighted ? '0 6px 24px rgba(34,197,94,0.12)' : undefined,
                      transform: isHighlighted ? 'translateY(-2px)' : undefined,
                      borderLeft: isActive ? '3px solid rgba(125,211,252,0.4)' : undefined,
                      background: isHighlighted ? 'linear-gradient(90deg, rgba(34,197,94,0.03), transparent)' : undefined
                    };
                    return (
                      <div
                        className={`routine-item ${isActive ? 'routine-item-active' : ''}`}
                        onClick={() => { selectRoutine(item); }}
                        style={itemStyle}
                      >
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <SettingOutlined style={{ color: '#52c41a' }} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <Text style={{ color: 'white', fontWeight: 500, fontSize: 13 }}>{item.name}</Text>
                            <Text type="secondary" style={{ fontSize: '10px' }}>{item.type}</Text>
                          </div>
                        </div>
                        <div>
                          <Tag color={exists ? 'green' : 'volcano'} style={{ fontSize: 10 }}>{exists ? 'exists' : 'new'}</Tag>
                        </div>
                      </div>
                    );
                  }}
                />

                <Divider style={{ margin: '12px 0' }} />

                {/* Procedures */}
                <div style={{ marginBottom: 8 }}>
                  <Text strong style={{ color: '#fff' }}>Procedures ({routines.filter(r => r.type === 'PROCEDURE').length})</Text>
                </div>
                <List
                  dataSource={routines.filter(r => r.type === 'PROCEDURE')}
                  renderItem={item => {
                    const exists = routineExistMap[item.name?.toLowerCase()]?.exists;
                    const isActive = selectedRoutine?.id === item.id;
                    const isHighlighted = highlightRoutineId === item.id;
                    const itemStyle = {
                      padding: '8px 10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'box-shadow 200ms, transform 120ms',
                      boxShadow: isHighlighted ? '0 6px 24px rgba(250,173,20,0.12)' : undefined,
                      transform: isHighlighted ? 'translateY(-2px)' : undefined,
                      borderLeft: isActive ? '3px solid rgba(125,211,252,0.4)' : undefined,
                      background: isHighlighted ? 'linear-gradient(90deg, rgba(250,173,20,0.03), transparent)' : undefined
                    };
                    return (
                      <div
                        className={`routine-item ${isActive ? 'routine-item-active' : ''}`}
                        onClick={() => { selectRoutine(item); }}
                        style={itemStyle}
                      >
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <SettingOutlined style={{ color: '#faad14' }} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <Text style={{ color: 'white', fontWeight: 500, fontSize: 13 }}>{item.name}</Text>
                            <Text type="secondary" style={{ fontSize: '10px' }}>{item.type}</Text>
                          </div>
                        </div>
                        <div>
                          <Tag color={exists ? 'green' : 'volcano'} style={{ fontSize: 10 }}>{exists ? 'exists' : 'new'}</Tag>
                        </div>
                      </div>
                    );
                  }}
                />
              </div>
            </Col>
            <Col span={18} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              {selectedRoutine ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <Row gutter={16} style={{ height: '100%' }}>
                      <Col span={12} style={{ height: '100%' }}>
                        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-text)' }}>
                          <DatabaseOutlined /> <span>MSSQL T-SQL (SOURCE)</span>
                        </div>
                        <div className="editor-pane" style={{ height: 'calc(100% - 32px)' }}>
                          <ConsoleEditor
                            value={selectedRoutine.code}
                            language="sql"
                            onChange={() => { }}
                          />
                        </div>
                      </Col>
                      <Col span={12} style={{ height: '100%' }}>
                        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)' }}>
                          <CodeOutlined /> <span>POSTGRES PL/PGSQL (CONVERTED)</span>
                        </div>
                        <div className="editor-pane" style={{ height: 'calc(100% - 32px)' }}>
                          {loading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: 'rgba(0,0,0,0.2)' }}>
                              <Spin size="large" tip="AI is converting..." />
                            </div>
                          ) : (
                            <ConsoleEditor
                              value={convertedCode || '-- Click Convert to generate code --'}
                              language="sql"
                              onChange={setConvertedCode}
                            />
                          )}
                        </div>
                      </Col>
                    </Row>
                  </div>
                </div>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <EmptyState text="Select a routine to begin transform" />
                </div>
              )}
            </Col>
          </Row>
        </div>
      ),
      actions: (
        <>
          <button className="btn" onClick={prev}><LeftOutlined /> BACK</button>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn" onClick={() => handleConvert(selectedRoutine)} disabled={loading || !selectedRoutine || routineExistMap[selectedRoutine?.name?.toLowerCase()]?.exists}>
              <SyncOutlined spin={loading} /> CONVERT WORKLOAD
            </button>
            <button
              className="btn primary"
              onClick={handleDeploy}
              disabled={loading || !convertedCode}
            >
              <RocketOutlined /> DEPLOY TO TARGET
            </button>
            <button className="btn" onClick={next}>FINALIZE <RightOutlined /></button>
          </div>
        </>
      )
    },
    {
      title: 'Finalize',
      description: 'Review & Finish',
      content: (
        <div style={{ textAlign: 'center', paddingTop: '100px' }}>
          <div style={{ marginBottom: 32 }}>
            <CheckCircleOutlined style={{ fontSize: 80, color: '#86efac' }} />
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 16 }}>MIGRATION PIPELINE DEPLOYED</div>
          <div style={{ color: 'var(--muted-text)', fontSize: '1.2rem', maxWidth: 600, margin: '0 auto 40px' }}>
            All systems are synchronized. Your schemas, data, and business logic have been successfully processed and verified.
          </div>
        </div>
      ),
      actions: (
        <>
          <div />
          <button className="btn primary" onClick={() => setCurrent(0)}>
            DISCONNECT & START NEW SESSION
          </button>
        </>
      )
    }
  ];

  const items = steps.map((item, index) => ({
    key: item.title,
    title: item.title,
    description: item.description,
    icon: item.icon,
    disabled: index > current && !mssqlConfig // Simple rule: only allowed to go back or forward if validated
  }));

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#7dd3fc',
          borderRadius: 6,
        },
      }}
    >
      <div className="term-app">
        <aside className="term-sidebar">
          <div className="term-card">
            <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>procly</div>
            <div style={{ fontSize: 12, color: 'var(--muted-text)' }}>Control Center v2.0</div>
          </div>

          <div className="term-card term-steps">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className={`term-step ${i === current ? 'active' : ''} ${(i > current && !mssqlConfig) || migrationLoading ? 'disabled' : ''}`}
                onClick={() => !migrationLoading && goToStep(i)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13 }}>{s.title}</span>
                    <span style={{ fontSize: 10, opacity: 0.6 }}>{s.description}</span>
                  </div>
                </div>
                {i < current && <CheckCircleOutlined style={{ color: '#22c55e' }} />}
              </div>
            ))}
          </div>

          <div className="term-card" style={{ marginTop: 'auto' }}>
            <div style={{ fontSize: 12, color: 'var(--muted-text)', marginBottom: 8 }}>SESSION INFO</div>
            <div style={{ fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>MSSQL:</span>
                <span style={{ color: mssqlConfig ? '#86efac' : '#fda4af' }}>{mssqlConfig ? mssqlConfig.database : 'Disconnected'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span>POSTGRES:</span>
                <span style={{ color: postgresConfig ? '#86efac' : '#fda4af' }}>{postgresConfig ? postgresConfig.database : 'Disconnected'}</span>
              </div>
            </div>
            <button
              className="btn"
              disabled={migrationLoading}
              onClick={() => {
                if (migrationLoading) return;
                sessionStorage.clear();
                setMssqlConfig(null);
                setPostgresConfig(null);
                setTables([]);
                setTargetTables([]);
                setSelectedTables([]);
                setRoutines([]);
                setMigrationLogs([]);
                setTableTransferStatus({});
                setCurrentSchema(null);
                setMappingTable(null);
                setEditedSchemas({});
                setCurrent(0);
                mssqlForm.resetFields();
                postgresForm.resetFields();
                mssqlForm.setFieldsValue({ host: 'localhost', port: 1433, user: 'sa', remember: true });
                postgresForm.setFieldsValue({ host: 'localhost', port: 5432, user: 'postgres', remember: true });
                message.info('Session terminated. All state cleared.');
              }}
              style={{
                width: '100%',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#fca5a5',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: migrationLoading ? 0.4 : 1
              }}
            >
              <span style={{ fontSize: 12 }}>⏹</span> TERMINATE SESSION
            </button>
          </div>
        </aside>

        <main
          className="term-main"
          style={{ gridTemplateRows: `auto 1fr auto ${migrationLoading ? '300px' : '160px'}` }}
        >
          <div className="term-topbar">
            <div className="cmd-input" style={{ fontWeight: 700, color: '#7dd3fc' }}>db_convert &gt; MRCA &gt; schema_sync</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted-text)' }}>{geminiKey ? 'Key: •••••' : 'No Gemini key'}</div>
              <button
                ref={geminiBtnRef}
                className="btn"
                onClick={saveGeminiKey}
                title="Set Gemini API key"
                style={geminiHighlight ? { boxShadow: '0 0 0 6px rgba(125,211,252,0.12)', borderColor: '#7dd3fc', transform: 'translateY(-1px)' } : {}}
              >Set Key</button>
              <button className="btn" onClick={removeGeminiKey} title="Remove stored Gemini API key">Remove</button>
              <button className="btn" onClick={() => window.open('https://aistudio.google.com/', '_blank')} title="How to get a Gemini API key">?</button>
            </div>
            {current < steps.length - 1 && (
              <button className="btn primary" onClick={next} disabled={migrationLoading || current >= steps.length - 1}>
                NEXT STEP <RightOutlined />
              </button>
            )}
          </div>

          <div className="term-content">
            <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
              {steps[current].content}
            </div>
          </div>

          <div className="term-actions">
            {steps[current].actions}
          </div>

          <div className="logs" style={{ transition: 'all 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, letterSpacing: '0.05em', fontSize: 11, color: 'var(--accent)' }}>SYSTEM LOGS & AI REASONING</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--muted-text)' }}>{migrationLogs.length} entries</div>
                <button
                  onClick={() => setMigrationLogs([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: 10,
                    cursor: 'pointer',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    hover: { background: 'rgba(125, 211, 252, 0.1)' }
                  }}
                  className="log-clear-btn"
                >
                  CLEAR
                </button>
              </div>
            </div>
            {migrationLogs.length === 0 ? (
              <div style={{ color: 'var(--muted-text)', fontSize: 12, fontStyle: 'italic' }}>Waiting for operations...</div>
            ) : (
              Array.isArray(migrationLogs) && migrationLogs.map((log, i) => (
                <div key={i} className={`log-line log-${log.type || 'info'}`}>
                  <span style={{ opacity: 0.4, marginRight: 8 }}>[{log.timestamp}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </main>
      </div>

      {/* ─── Biometric Loading Overlay ──────────────────────────────── */}
      {vaultBiometricLoading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16
        }}>
          <div style={{ fontSize: 64 }}>🔒</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '0.05em' }}>VERIFYING IDENTITY</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Waiting for Windows Hello / biometric confirmation...</div>
          <SyncOutlined spin style={{ fontSize: 24, color: 'var(--accent)', marginTop: 8 }} />
        </div>
      )}

      {/* ─── Vault PIN Fallback Modal ───────────────────────────────── */}
      <Modal
        open={vaultUnlockVisible}
        onCancel={() => { if (!pendingVaultEntry?.isSaving) setVaultUnlockVisible(false); }}
        footer={null}
        width={360}
        centered
        closable={!pendingVaultEntry?.isSaving}
        styles={{ content: { background: '#0f1117', border: '1px solid rgba(125,211,252,0.2)', borderRadius: 12 }, header: { background: '#0f1117' }, mask: { backdropFilter: 'blur(4px)' } }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
            <span style={{ fontSize: 20 }}>🔐</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{isSettingPin ? 'CREATE VAULT PIN' : 'VAULT PIN REQUIRED'}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>
                {isSettingPin ? 'Biometrics unavailable — secure with a PIN instead' : 'Biometrics declined or unavailable'}
              </div>
            </div>
          </div>
        }
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: '0.05em' }}>
              {isSettingPin ? 'NEW VAULT PIN' : 'VAULT PIN'}
            </div>
            <Input.Password
              autoFocus
              placeholder={isSettingPin ? 'Choose a PIN (min 4 characters)' : 'Enter your vault PIN'}
              value={vaultPinInput}
              onChange={e => { setVaultPinInput(e.target.value); setVaultPinError(''); }}
              onPressEnter={isSettingPin ? undefined : handleVaultUnlock}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
            />
          </div>

          {isSettingPin && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: '0.05em' }}>CONFIRM PIN</div>
              <Input.Password
                placeholder="Re-enter your PIN"
                value={vaultPinConfirm}
                onChange={e => { setVaultPinConfirm(e.target.value); setVaultPinError(''); }}
                onPressEnter={handleVaultUnlock}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
            </div>
          )}

          {vaultPinError && (
            <div style={{ color: '#f87171', fontSize: 11, marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)' }}>
              ⚠ {vaultPinError}
            </div>
          )}

          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleVaultUnlock}>
            {isSettingPin ? '🔒 SET PIN & SECURE' : '🔓 UNLOCK & LOAD'}
          </button>

          <div style={{ marginTop: 10, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
            AES-256-GCM · PBKDF2/100k rounds · Vault fallback mode
          </div>
        </div>
      </Modal>
    </ConfigProvider>
  );
};

const EmptyState = ({ text }) => (
  <div style={{ textAlign: 'center' }}>
    <CodeOutlined style={{ fontSize: 48, color: 'rgba(255,255,255,0.1)', marginBottom: 16 }} />
    <Paragraph type="secondary">{text}</Paragraph>
  </div>
);

export default App;
