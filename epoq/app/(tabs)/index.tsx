import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const SCAN_BOX = 270;

interface LogEntry {
  type: 'info' | 'error' | 'success';
  msg: string;
  ts: string;
}

interface ConnInfo {
  ip: string;
  port: string;
  token: string;
}

/* ════════════════════════════════════════
   ROOT
════════════════════════════════════════ */
export default function App() {
  const [connInfo, setConnInfo] = useState<ConnInfo | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  return (
    <View style={s.root}>
      <LinearGradient colors={['#020917', '#0a1628', '#020917']} style={StyleSheet.absoluteFillObject} />

      {/* ── NAVBAR ── */}
      <View style={s.navbar}>
        <View style={s.navLogo}>
          <View style={s.navE}><Text style={s.navEText}>E</Text></View>
          <Text style={s.navTitle}>EPOQ</Text>
        </View>

        <View style={s.navRight}>
          {connInfo && (
            <View style={s.navPill}>
              <View style={[s.navDot, { backgroundColor: '#10b981' }]} />
              <Text style={s.navPillText}>{connInfo.ip}</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => setScanOpen(true)} style={s.camBtn} activeOpacity={0.75}>
            <Text style={s.camIcon}>⊞</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── DASHBOARD BODY ── */}
      <Dashboard connInfo={connInfo} />

      {/* ── SCANNER MODAL ── */}
      <Modal visible={scanOpen} animationType="slide" presentationStyle="fullScreen">
        <ScanScreen
          onClose={() => setScanOpen(false)}
          onConnect={(info) => { setConnInfo(info); setScanOpen(false); }}
        />
      </Modal>
    </View>
  );
}

/* ════════════════════════════════════════
   DASHBOARD (always shown as home)
════════════════════════════════════════ */
function Dashboard({ connInfo }: { connInfo: ConnInfo | null }) {
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [totalEpochs, setTotalEpochs] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [loss, setLoss] = useState(0);
  const [valAcc, setValAcc] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(p => [...p.slice(-300), { type, msg, ts }]);
  };

  useEffect(() => {
    if (!connInfo) return;

    // close any prev connection
    wsRef.current?.close();

    const ws = new WebSocket(`ws://${connInfo.ip}:${connInfo.port}`);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ action: 'auth', token: connInfo.token }));

    ws.onmessage = ({ data }) => {
      try {
        const d = JSON.parse(data);
        if (d.status === 'authenticated') {
          setConnected(true);
          addLog('✅ Authenticated with Desktop App', 'success');
        } else if (d.status === 'auth_failed') {
          addLog('❌ Authentication failed — rescan QR.', 'error');
          ws.close();
        } else if (d.status === 'training') {
          setIsTraining(true);
          setEpoch(d.epoch);
          setTotalEpochs(d.total_epochs);
          setAccuracy(parseFloat(d.train_accuracy ?? '0'));
          setLoss(parseFloat(d.train_loss ?? '0'));
          setValAcc(parseFloat(d.val_accuracy ?? '0'));
        } else if (d.status === 'stopped_early' || d.status === 'evaluation_complete') {
          setIsTraining(false);
          addLog(d.message ?? 'Training finished.', 'success');
        } else if (d.message) {
          addLog(d.message, d.type ?? 'info');
        }
      } catch {
        if (data?.trim()) addLog(data, 'info');
      }
    };

    ws.onerror = () => addLog('⚠️ Connection error', 'error');
    ws.onclose = () => { setConnected(false); setIsTraining(false); };

    return () => ws.close();
  }, [connInfo]);

  const stop = () => {
    wsRef.current?.send(JSON.stringify({ action: 'stop_training' }));
    addLog('⏹ Stop command sent to Desktop', 'info');
  };

  const progress = totalEpochs > 0 ? (epoch / totalEpochs) * 100 : 0;

  return (
    <View style={s.body}>

      {/* ─── Status bar ─── */}
      <View style={s.statusRow}>
        <View style={s.statusBadge}>
          <View style={[s.dot, { backgroundColor: connected ? '#10b981' : connInfo ? '#f59e0b' : '#334155' }]} />
          <Text style={s.statusBadgeText}>
            {connected ? 'Live' : connInfo ? 'Connecting…' : 'Not Connected'}
          </Text>
        </View>
        {isTraining && (
          <View style={s.trainingBadge}>
            <Text style={s.trainingBadgeTxt}>● Training</Text>
          </View>
        )}
      </View>

      {/* ─── Metric cards ─── */}
      <View style={s.metricsRow}>
        <MetricCard label="Epoch" value={String(epoch)} sub={`/${totalEpochs || '–'}`} accent="#10b981" />
        <MetricCard label="Accuracy" value={(accuracy * 100).toFixed(1)} sub="%" accent="#38bdf8" />
        <MetricCard label="Val Acc" value={(valAcc * 100).toFixed(1)} sub="%" accent="#a78bfa" />
        <MetricCard label="Loss" value={loss > 0 ? loss.toFixed(3) : '–'} accent="#f59e0b" />
      </View>

      {/* ─── Progress bar ─── */}
      <View style={s.progressWrap}>
        <View style={s.progressBar}>
          <LinearGradient
            colors={['#10b981', '#059669']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[s.progressFill, { width: `${progress}%` as any }]}
          />
        </View>
        <Text style={s.progressTxt}>{progress.toFixed(0)}%</Text>
      </View>

      {/* ─── Stop button ─── */}
      <TouchableOpacity onPress={stop} disabled={!isTraining || !connected} activeOpacity={0.8}>
        <LinearGradient
          colors={isTraining && connected ? ['#ef4444', '#b91c1c'] : ['#1e293b', '#0f172a']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={s.stopBtn}
        >
          <Text style={[s.stopTxt, (!isTraining || !connected) && { color: '#475569' }]}>
            {isTraining ? '⏹  Halt Execution' : '◎  Idle — Waiting for Training'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* ─── Terminal console ─── */}
      <View style={s.console}>
        <View style={s.consoleBar}>
          <Text style={s.macDot}>● </Text>
          <Text style={[s.macDot, { color: '#f59e0b' }]}>● </Text>
          <Text style={[s.macDot, { color: '#10b981' }]}>●</Text>
          <Text style={s.consoleTitle}>  Live Output</Text>
          {isTraining && <View style={s.liveDot} />}
          <Text style={s.consoleRight}>{logs.length} lines</Text>
        </View>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {logs.length === 0 ? (
            <Text style={s.noLogs}>
              {connInfo ? 'Authenticated — awaiting training output…' : 'Tap  ⊞  in the top right to scan the QR code\nand connect to your EPOQ Desktop App.'}
            </Text>
          ) : logs.map((l, i) => (
            <Text
              key={i}
              style={[s.logLine, l.type === 'error' && { color: '#f43f5e' }, l.type === 'success' && { color: '#34d399' }]}
            >
              <Text style={s.logTs}>{l.ts}  </Text>{l.msg}
            </Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

/* ════════════════════════════════════════
   METRIC CARD
════════════════════════════════════════ */
function MetricCard({ label, value, sub = '', accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <View style={[s.card, { borderColor: accent + '44' }]}>
      <LinearGradient colors={[accent + '20', 'transparent']} style={StyleSheet.absoluteFillObject} />
      <Text style={s.cardLabel}>{label}</Text>
      <Text style={[s.cardVal, { color: accent }]}>
        {value}<Text style={s.cardSub}>{sub}</Text>
      </Text>
    </View>
  );
}

/* ════════════════════════════════════════
   SCANNER SCREEN (shown as modal)
════════════════════════════════════════ */
function ScanScreen({ onClose, onConnect }: { onClose: () => void; onConnect: (info: ConnInfo) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const laser = useSharedValue(0);

  useEffect(() => {
    laser.value = withRepeat(
      withSequence(
        withTiming(SCAN_BOX - 4, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.ease) })
      ), -1, true
    );
  }, []);

  const laserAnim = useAnimatedStyle(() => ({ transform: [{ translateY: laser.value }] }));

  const onBarcode = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    try {
      const p = JSON.parse(data);
      if (p.ip && p.port && p.token) {
        Alert.alert('EPOQ Desktop Found', `Connect to ${p.ip}:${p.port}?`, [
          { text: 'Connect', onPress: () => onConnect({ ip: p.ip, port: String(p.port), token: p.token }) },
          { text: 'Cancel', style: 'cancel', onPress: () => setTimeout(() => setScanned(false), 400) },
        ]);
      } else throw new Error();
    } catch {
      Alert.alert('Invalid QR Code', 'Please scan a valid EPOQ QR code from the desktop app.');
      setTimeout(() => setScanned(false), 2000);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#020917' }]}>
        <LinearGradient colors={['#020917', '#0a1628']} style={StyleSheet.absoluteFillObject} />
        <Text style={{ fontSize: 72, marginBottom: 16 }}>📷</Text>
        <Text style={[s.navTitle, { fontSize: 26, marginBottom: 10 }]}>Camera Permission</Text>
        <Text style={s.noLogs}>Required to scan the EPOQ QR code.</Text>
        <TouchableOpacity onPress={requestPermission} style={[s.stopBtn, { marginTop: 32, backgroundColor: 'transparent' }]}>
          <LinearGradient colors={['#10b981', '#059669']} style={[s.stopBtn, { margin: 0 }]}>
            <Text style={[s.stopTxt, { color: '#fff' }]}>Grant Permission</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={{ marginTop: 16 }}>
          <Text style={s.noLogs}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : onBarcode}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Overlay cutout */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <View style={s.overlayTop} />
        <View style={{ flexDirection: 'row', height: SCAN_BOX }}>
          <View style={s.overlaySide} />
          <View style={{ width: SCAN_BOX }}>
            <View style={[s.corner, s.tl]} /><View style={[s.corner, s.tr]} />
            <View style={[s.corner, s.bl]} /><View style={[s.corner, s.br]} />
            <Animated.View style={[s.laser, laserAnim]} />
          </View>
          <View style={s.overlaySide} />
        </View>
        <View style={[s.overlayTop, { alignItems: 'center', justifyContent: 'flex-start', paddingTop: 28 }]}>
          <Text style={s.scanHint}>Point the frame at the QR code on your desktop</Text>
        </View>
      </View>

      {/* Scan top bar — reuse EPOQ navbar look */}
      <View style={s.scanTopBar}>
        <View style={s.navLogo}>
          <View style={s.navE}><Text style={s.navEText}>E</Text></View>
          <Text style={s.navTitle}>EPOQ</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={s.closeCircle} activeOpacity={0.75}>
          <Text style={s.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      {scanned && (
        <View style={s.rescanWrap}>
          <TouchableOpacity onPress={() => setScanned(false)} activeOpacity={0.8}>
            <LinearGradient colors={['#1e293b', '#0f172a']} style={s.rescanBtn}>
              <Text style={s.rescanTxt}>↺  Scan Again</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ════════════════════════════════════════
   STYLES
════════════════════════════════════════ */
const OVERLAY = 'rgba(2,9,23,0.84)';

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020917' },

  /* ── Navbar ── */
  navbar: {
    paddingTop: 54, paddingBottom: 14, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(10,22,40,0.95)',
  },
  navLogo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navE: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: '#10b981',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 6,
  },
  navEText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  navTitle: { color: '#f1f5f9', fontSize: 22, fontWeight: '800', letterSpacing: 1.5 },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 100, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
  },
  navDot: { width: 7, height: 7, borderRadius: 3.5 },
  navPillText: { color: '#10b981', fontSize: 12, fontWeight: '700' },
  camBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  camIcon: { color: '#10b981', fontSize: 20 },
  dot: { width: 9, height: 9, borderRadius: 5 },

  /* ── Dashboard body ── */
  body: { flex: 1, padding: 16, gap: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  statusBadgeText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  trainingBadge: {
    backgroundColor: 'rgba(16,185,129,0.1)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 100, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
  },
  trainingBadgeTxt: { color: '#10b981', fontSize: 13, fontWeight: '700' },

  /* ── Metrics ── */
  metricsRow: { flexDirection: 'row', gap: 10 },
  card: {
    flex: 1, padding: 14, borderRadius: 18, borderWidth: 1,
    overflow: 'hidden', backgroundColor: 'rgba(15,23,42,0.5)',
  },
  cardLabel: { color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginBottom: 8 },
  cardVal: { fontSize: 22, fontWeight: '900', fontFamily: 'monospace' },
  cardSub: { fontSize: 13, color: '#64748b', fontWeight: 'normal' },

  /* ── Progress ── */
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressBar: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressTxt: { color: '#64748b', fontSize: 13, fontWeight: '700', width: 36, textAlign: 'right' },

  /* ── Stop ── */
  stopBtn: {
    margin: 0, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  stopTxt: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  /* ── Console ── */
  console: {
    flex: 1, borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
    backgroundColor: 'rgba(10,22,40,0.7)',
  },
  consoleBar: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  macDot: { color: '#ef4444', fontSize: 12 },
  consoleTitle: { color: '#e2e8f0', fontSize: 13, fontWeight: '600', flex: 1, letterSpacing: 0.3 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10b981', marginRight: 8 },
  consoleRight: { color: '#334155', fontSize: 11 },
  noLogs: { color: '#334155', fontSize: 13, fontFamily: 'monospace', textAlign: 'center', marginTop: 20, lineHeight: 22 },
  logLine: { color: '#cbd5e1', fontSize: 12, fontFamily: 'monospace', lineHeight: 20, marginBottom: 3 },
  logTs: { color: '#334155' },

  /* ── Scanner overlay ── */
  overlayTop: { flex: 1, backgroundColor: OVERLAY },
  overlaySide: { flex: 1, backgroundColor: OVERLAY },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: '#10b981', borderWidth: 0 },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  laser: {
    width: '100%', height: 3, backgroundColor: '#10b981',
    shadowColor: '#10b981', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 12, elevation: 10,
  },
  scanHint: { color: '#94a3b8', fontSize: 15, fontWeight: '500', letterSpacing: 0.3 },
  scanTopBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 54, paddingBottom: 14, paddingHorizontal: 18,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(10,22,40,0.85)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  closeCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center',
  },
  closeTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  rescanWrap: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center' },
  rescanBtn: {
    paddingVertical: 14, paddingHorizontal: 40, borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  rescanTxt: { color: '#10b981', fontSize: 16, fontWeight: '700' },
});
