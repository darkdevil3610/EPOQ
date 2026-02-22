import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

const { width } = Dimensions.get('window');
const SCAN_BOX = 270;

const MODELS = ['resnet18', 'resnet50', 'efficientnet_b0', 'vit_b_16', 'eva02'];

interface LogEntry { type: 'info' | 'error' | 'success'; msg: string; ts: string; }
interface ConnInfo { ip: string; port: string; token: string; }

/* ════════════════════════════════════════
   ROOT
════════════════════════════════════════ */
export default function App() {
  const [connInfo, setConnInfo] = useState<ConnInfo | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [ctrlOpen, setCtrlOpen] = useState(false);
  const [datasetPath, setDatasetPath] = useState<string | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const datasetPathRef = useRef<(p: string | null) => void>(setDatasetPath);

  return (
    <View style={s.root}>

      {/* ── NAVBAR ── */}
      <View style={s.navbar}>
        <View style={s.navLogo}>
          <Image source={require('../../assets/images/epoq2.png')} style={s.navLogoImg} />
          <Text style={s.navTitle}>EPOQ</Text>
        </View>
        <View style={s.navRight}>
          {connInfo && (
            <View style={s.navPill}>
              <View style={[s.navDot, { backgroundColor: '#10b981' }]} />
              <Text style={s.navPillText}>{connInfo.ip}</Text>
            </View>
          )}
          {/* Controls icon */}
          {connInfo && (
            <TouchableOpacity onPress={() => setCtrlOpen(true)} style={[s.camBtn, { backgroundColor: 'rgba(56,189,248,0.12)', borderColor: 'rgba(56,189,248,0.35)' }]} activeOpacity={0.75}>
              <Text style={[s.camIcon, { color: '#38bdf8' }]}>⚙</Text>
            </TouchableOpacity>
          )}
          {/* Camera/scan icon */}
          <TouchableOpacity onPress={() => setScanOpen(true)} style={s.camBtn} activeOpacity={0.75}>
            <Text style={s.camIcon}>⊞</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── DASHBOARD BODY ── */}
      <Dashboard connInfo={connInfo} onOpenControls={() => setCtrlOpen(true)} onDatasetUpdate={(p) => setDatasetPath(p)} onTrainingChange={setIsTraining} />

      {/* ── SCANNER MODAL ── */}
      <Modal visible={scanOpen} animationType="slide" presentationStyle="fullScreen">
        <ScanScreen
          onClose={() => setScanOpen(false)}
          onConnect={(info) => { setConnInfo(info); setScanOpen(false); }}
        />
      </Modal>

      {/* ── CONTROLS MODAL ── */}
      {connInfo && (
        <Modal visible={ctrlOpen} animationType="slide" transparent>
          <ControlsSheet
            connInfo={connInfo}
            datasetPath={datasetPath}
            isTraining={isTraining}
            onClose={() => setCtrlOpen(false)}
          />
        </Modal>
      )}
    </View>
  );
}

/* ════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════ */
function Dashboard({ connInfo, onOpenControls, onDatasetUpdate, onTrainingChange }: { connInfo: ConnInfo | null; onOpenControls: () => void; onDatasetUpdate: (p: string | null) => void; onTrainingChange: (t: boolean) => void }) {
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [totalEpochs, setTotalEpochs] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [loss, setLoss] = useState(0);
  const [valAcc, setValAcc] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [matrixImage, setMatrixImage] = useState<string | null>(null);
  const [chartData, setChartData] = useState<{ epoch: number; acc: number; loss: number }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Expose ws to window for ControlsSheet to use
  (global as any).__epoqWs = wsRef;

  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(p => [...p.slice(-300), { type, msg, ts }]);
  };

  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!connInfo) return;

    // A new connInfo means a fresh QR scan — wipe stale data from the old session
    setConnected(false);
    setReconnecting(false);
    setIsTraining(false);
    onTrainingChange(false);
    setEpoch(0); setTotalEpochs(0);
    setAccuracy(0); setLoss(0); setValAcc(0);
    setMatrixImage(null); setChartData([]); setLogs([]);

    wsRef.current?.close();
    const ws = new WebSocket(`ws://${connInfo.ip}:${connInfo.port}`);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ action: 'auth', token: connInfo.token }));
    ws.onmessage = ({ data }) => {
      try {
        const d = JSON.parse(data);
        if (d.status === 'authenticated') {
          setConnected(true); setReconnecting(false);
          addLog('✅ Authenticated with Desktop App', 'success');
        } else if (d.status === 'auth_failed') {
          addLog('❌ Auth failed — rescan QR.', 'error'); ws.close();
        } else if (d.status === 'training') {
          setIsTraining(true); onTrainingChange(true);
          const ep = d.epoch;
          const acc = parseFloat(d.train_accuracy ?? '0');
          const ls = parseFloat(d.train_loss ?? '0');
          setEpoch(ep); setTotalEpochs(d.total_epochs);
          setAccuracy(acc); setLoss(ls);
          setValAcc(parseFloat(d.val_accuracy ?? '0'));
          setChartData(prev => [...prev.slice(-59), { epoch: ep, acc, loss: ls }]);
        } else if (d.status === 'stopped_early' || d.status === 'evaluation_complete') {
          setIsTraining(false); onTrainingChange(false);
          addLog(d.message ?? 'Training finished.', 'success');
        } else if (d.type === 'dataset_update') {
          onDatasetUpdate(d.path ?? null);
          if (d.path) addLog(`📁 Dataset: ${d.path}`, 'success');
          else addLog('📂 No folder selected', 'info');
        } else if (d.type === 'confusion_matrix') {
          setMatrixImage(d.data ?? null);
          addLog('📊 Confusion matrix received!', 'success');
        } else if (d.type === 'training_busy') {
          Alert.alert('⚠️ Already Running', d.message ?? 'Training is already in progress on the desktop.');
        } else if (d.message) { addLog(d.message, d.type ?? 'info'); }
      } catch { if (data?.trim()) addLog(data, 'info'); }
    };
    ws.onerror = () => addLog('⚠️ Connection error', 'error');
    ws.onclose = () => {
      // Don't wipe metrics — just mark as disconnected so the user can see last known state
      setConnected(false);
      setIsTraining(false);
      onTrainingChange(false);
      setReconnecting(true); // show "reconnecting" rather than clearing
    };
    return () => ws.close();
  }, [connInfo]);

  const stop = () => {
    wsRef.current?.send(JSON.stringify({ action: 'stop_training' }));
    addLog('⏹ Stop command sent to Desktop', 'info');
  };

  const progress = totalEpochs > 0 ? Math.min((epoch / totalEpochs) * 100, 100) : 0;

  return (
    <ScrollView style={s.body} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {/* Status row */}
      <View style={s.statusRow}>
        <View style={s.statusBadge}>
          <View style={[s.dot, {
            backgroundColor: connected ? '#10b981' : reconnecting ? '#f59e0b' : connInfo ? '#f59e0b' : '#334155'
          }]} />
          <Text style={s.statusBadgeText}>
            {connected ? 'Live' : reconnecting ? 'Reconnecting…' : connInfo ? 'Connecting…' : 'Not Connected'}
          </Text>
        </View>
        {isTraining && <View style={s.trainingBadge}><Text style={s.trainingBadgeTxt}>● Training</Text></View>}
        {connected && !isTraining && (
          <TouchableOpacity onPress={onOpenControls} style={s.startBadge} activeOpacity={0.8}>
            <Text style={s.startBadgeTxt}>▶ Start</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Metrics */}
      <View style={s.metricsRow}>
        <MetricCard label="Epoch" value={String(epoch)} sub={`/${totalEpochs || '–'}`} accent="#10b981" />
        <MetricCard label="Accuracy" value={(accuracy * 100).toFixed(1)} sub="%" accent="#38bdf8" />
        <MetricCard label="Val Acc" value={(valAcc * 100).toFixed(1)} sub="%" accent="#a78bfa" />
        <MetricCard label="Loss" value={loss > 0 ? loss.toFixed(3) : '–'} accent="#f59e0b" />
      </View>

      {/* Live Charts */}
      {chartData.length > 1 && (
        <View style={s.chartsRow}>
          <SparkLine
            data={chartData.map(d => d.acc)}
            label="Accuracy"
            color="#38bdf8"
            formatY={v => `${(v * 100).toFixed(0)}%`}
          />
          <SparkLine
            data={chartData.map(d => d.loss)}
            label="Loss"
            color="#f59e0b"
            formatY={v => v.toFixed(3)}
            invertY
          />
        </View>
      )}
      {/* Progress bar */}
      <View style={s.progressWrap}>
        <View style={s.progressBar}>
          <LinearGradient colors={['#10b981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.progressFill, { width: `${progress}%` as any }]} />
        </View>
        <Text style={s.progressTxt}>{progress.toFixed(0)}%</Text>
      </View>

      {/* Stop button */}
      <TouchableOpacity onPress={stop} disabled={!isTraining || !connected} activeOpacity={0.8} style={s.stopBtnWrap}>
        <View style={[s.stopBtn, (!isTraining || !connected) && s.stopBtnDisabled]}>
          <Text style={[s.stopTxt, (!isTraining || !connected) && s.stopTxtDisabled]}>
            {isTraining ? '⏹  Halt Execution' : '◎  Idle — Waiting for Training'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Console */}
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
          style={{ height: 220 }}
          contentContainerStyle={{ padding: 14 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {logs.length === 0 ? (
            <Text style={s.noLogs}>{connInfo ? 'Authenticated — awaiting output…' : 'Tap  ⊞  to connect via QR code.'}</Text>
          ) : logs.map((l, i) => (
            <Text key={i} style={[s.logLine, l.type === 'error' && { color: '#f43f5e' }, l.type === 'success' && { color: '#34d399' }]}>
              <Text style={s.logTs}>{l.ts}  </Text>{l.msg}
            </Text>
          ))}
        </ScrollView>
      </View>

      {/* Confusion Matrix */}
      {matrixImage && (
        <View style={s.matrixCard}>
          <View style={s.matrixHeader}>
            <Text style={s.matrixTitle}>📊 Confusion Matrix</Text>
            <TouchableOpacity onPress={() => setMatrixImage(null)} style={s.matrixClose}>
              <Text style={{ color: '#64748b', fontSize: 16, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <Image
            source={{ uri: matrixImage }}
            style={s.matrixImg}
            resizeMode="contain"
          />
        </View>
      )}
    </ScrollView>
  );
}

/* ════════════════════════════════════════
   SPARKLINE CHART
════════════════════════════════════════ */
const CHART_H = 90;

function SparkLine({
  data,
  label,
  color,
  formatY,
  invertY = false,
}: {
  data: number[];
  label: string;
  color: string;
  formatY: (v: number) => string;
  invertY?: boolean;
}) {
  if (data.length < 2) return null;

  const chartW = (width - 48) / 2 - 10;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * chartW;
    const norm = (v - min) / range;
    const y = invertY
      ? norm * (CHART_H - 20) + 4
      : (1 - norm) * (CHART_H - 20) + 4;
    return { x, y };
  });

  // Build smooth SVG path using cubic bezier
  const pathD = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    const prev = pts[i - 1];
    const cp1x = ((prev.x + p.x) / 2).toFixed(1);
    const cp1y = prev.y.toFixed(1);
    const cp2x = ((prev.x + p.x) / 2).toFixed(1);
    const cp2y = p.y.toFixed(1);
    return `${acc} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }, '');

  // Fill path (closed)
  const fillD = `${pathD} L ${pts[pts.length - 1].x.toFixed(1)} ${CHART_H} L 0 ${CHART_H} Z`;

  const last = data[data.length - 1];
  const gradId = `grad_${label}`;

  return (
    <View style={[s.chartCard, { borderColor: color + '33' }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, paddingHorizontal: 2 }}>
        <Text style={[s.chartLabel, { color: color }]}>{label}</Text>
        <Text style={[s.chartVal, { color: color }]}>{formatY(last)}</Text>
      </View>
      <Svg width={chartW} height={CHART_H}>
        <Defs>
          <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </SvgGradient>
        </Defs>
        {/* Fill */}
        <Path d={fillD} fill={`url(#${gradId})`} />
        {/* Line */}
        <Path d={pathD} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/* ════════════════════════════════════════
   CONTROLS SHEET
════════════════════════════════════════ */
function ControlsSheet({ connInfo, onClose, datasetPath, isTraining }: { connInfo: ConnInfo; onClose: () => void; datasetPath: string | null; isTraining: boolean }) {
  const [epochs, setEpochs] = useState('10');
  const [batchSize, setBatchSize] = useState('32');
  const [lr, setLr] = useState('0.001');
  const [modelIdx, setModelIdx] = useState(0);
  const ws = (global as any).__epoqWs?.current as WebSocket | null;

  const handleSelectDataset = () => {
    if (ws?.readyState === 1) {
      ws.send(JSON.stringify({ action: 'select_dataset' }));
      onClose();
    } else {
      Alert.alert('Not Connected', 'WebSocket is not connected.');
    }
  };

  const sendAndClose = (action: string, extra: object) => {
    if (ws?.readyState === 1) {
      ws.send(JSON.stringify({ action, ...extra }));
    } else {
      Alert.alert('Not Connected', 'WebSocket is not connected.');
    }
    onClose();
  };

  const handleStart = () => {
    if (isTraining) {
      Alert.alert(
        'Training in Progress',
        'A training session is already running. Stop it first using the Halt Execution button.',
        [{ text: 'OK' }]
      );
      return;
    }
    const eLr = parseFloat(lr);
    const eBatch = parseInt(batchSize, 10);
    const eEpochs = parseInt(epochs, 10);
    if (isNaN(eLr) || isNaN(eBatch) || isNaN(eEpochs)) {
      Alert.alert('Invalid Values', 'Please enter valid numbers for all fields.');
      return;
    }
    sendAndClose('start_training', {
      epochs: eEpochs,
      batch_size: eBatch,
      learning_rate: eLr,
      model: MODELS[modelIdx],
    });
  };

  const handleAdjust = () => {
    const eLr = parseFloat(lr);
    const eBatch = parseInt(batchSize, 10);
    const eEpochs = parseInt(epochs, 10);
    sendAndClose('adjust_params', {
      epochs: eEpochs,
      batch_size: eBatch,
      learning_rate: eLr,
      model: MODELS[modelIdx],
    });
  };

  return (
    <View style={cs.backdrop}>
      <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={cs.sheet}>

        {/* Handle */}
        <View style={cs.handle} />

        <View style={cs.sheetContent}>
          <Text style={cs.sheetTitle}>Training Controls</Text>
          <Text style={cs.sheetSub}>Configure parameters and start training remotely</Text>

          {/* Dataset Selector */}
          <Text style={cs.label}>Dataset Folder</Text>
          <TouchableOpacity onPress={handleSelectDataset} activeOpacity={0.8} style={cs.datasetBtn}>
            <Text style={cs.datasetIcon}>📂</Text>
            <View style={{ flex: 1 }}>
              {datasetPath ? (
                <Text style={cs.datasetPath} numberOfLines={2}>{datasetPath}</Text>
              ) : (
                <Text style={cs.datasetPlaceholder}>Tap to select folder on Desktop…</Text>
              )}
            </View>
            <Text style={cs.datasetArrow}>→</Text>
          </TouchableOpacity>

          {/* Model selector */}
          <Text style={cs.label}>Model</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
            {MODELS.map((m, i) => (
              <TouchableOpacity key={m} onPress={() => setModelIdx(i)} style={[cs.modelChip, i === modelIdx && cs.modelChipActive]}>
                <Text style={[cs.modelChipTxt, i === modelIdx && cs.modelChipActiveTxt]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Param inputs */}
          <View style={cs.paramsGrid}>
            <ParamInput label="Epochs" value={epochs} onChangeText={setEpochs} hint="e.g. 20" />
            <ParamInput label="Batch Size" value={batchSize} onChangeText={setBatchSize} hint="e.g. 32" />
            <ParamInput label="Learning Rate" value={lr} onChangeText={setLr} hint="e.g. 0.001" />
          </View>

          {/* Quick presets */}
          <Text style={cs.label}>Quick Presets</Text>
          <View style={cs.presetsRow}>
            {[
              { name: 'Fast', t: { epochs: '5', batch_size: '64', lr: '0.001' } },
              { name: 'Standard', t: { epochs: '15', batch_size: '32', lr: '0.001' } },
              { name: 'Accurate', t: { epochs: '30', batch_size: '16', lr: '0.0001' } },
            ].map(p => (
              <TouchableOpacity key={p.name} onPress={() => { setEpochs(p.t.epochs); setBatchSize(p.t.batch_size); setLr(p.t.lr); }} style={cs.presetBtn} activeOpacity={0.75}>
                <Text style={cs.presetTxt}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Action buttons */}
          <TouchableOpacity onPress={handleStart} activeOpacity={0.85} style={cs.actionBtnPrimary}>
            <Text style={cs.actionBtnTxt}>▶  Start Training</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleAdjust} activeOpacity={0.85} style={cs.actionBtnSecondary}>
            <Text style={cs.actionBtnSecondaryTxt}>⚙  Apply Params (no restart)</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={cs.cancelBtn} activeOpacity={0.7}>
            <Text style={cs.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function ParamInput({ label, value, onChangeText, hint }: { label: string; value: string; onChangeText: (v: string) => void; hint: string }) {
  return (
    <View style={cs.paramWrap}>
      <Text style={cs.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholder={hint}
        placeholderTextColor="#334155"
        style={cs.input}
        selectTextOnFocus
      />
    </View>
  );
}

/* ════════════════════════════════════════
   METRIC CARD
════════════════════════════════════════ */
function MetricCard({ label, value, sub = '', accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <View style={s.card}>
      <Text style={s.cardLabel}>{label}</Text>
      <Text style={[s.cardVal, { color: accent }]}>{value}<Text style={s.cardSub}>{sub}</Text></Text>
    </View>
  );
}

/* ════════════════════════════════════════
   SCANNER
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
      Alert.alert('Invalid QR Code', 'Scan a valid EPOQ QR code from the desktop app.');
      setTimeout(() => setScanned(false), 2000);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Text style={{ fontSize: 72, marginBottom: 16 }}>📷</Text>
        <Text style={[s.navTitle, { fontSize: 24, marginBottom: 10 }]}>Camera Permission</Text>
        <Text style={s.noLogs}>Required to scan the EPOQ QR code.</Text>
        <TouchableOpacity onPress={requestPermission} activeOpacity={0.85} style={{ width: '100%', marginTop: 32, borderRadius: 14 }}>
          <View style={[s.stopBtn, { marginHorizontal: 0 }]}><Text style={s.stopTxt}>Grant Permission</Text></View>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={{ marginTop: 16 }}><Text style={s.noLogs}>← Go Back</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : onBarcode} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} />
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
      <View style={s.scanTopBar}>
        <View style={s.navLogo}>
          <Image source={require('../../assets/images/epoq2.png')} style={s.navLogoImg} />
          <Text style={s.navTitle}>EPOQ</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={s.closeCircle} activeOpacity={0.75}>
          <Text style={s.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>
      {scanned && (
        <View style={s.rescanWrap}>
          <TouchableOpacity onPress={() => setScanned(false)} activeOpacity={0.8} style={s.rescanBtn}>
            <Text style={s.rescanTxt}>↺  Scan Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ════════════════════════════════════════
   STYLES
════════════════════════════════════════ */
const OVERLAY = 'rgba(255,255,255,0.85)';

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  navbar: { paddingTop: 54, paddingBottom: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#27272a', backgroundColor: '#000000' },
  navLogo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navLogoImg: { width: 32, height: 32, resizeMode: 'contain', borderRadius: 8 },
  navTitle: { color: '#ffffff', fontSize: 22, fontWeight: '800', letterSpacing: 1.5 },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#18181b', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, borderWidth: 1, borderColor: '#27272a' },
  navDot: { width: 7, height: 7, borderRadius: 3.5 },
  navPillText: { color: '#a1a1aa', fontSize: 12, fontWeight: '700' },
  camBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a', justifyContent: 'center', alignItems: 'center' },
  camIcon: { color: '#ffffff', fontSize: 20 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  body: { flex: 1, padding: 16 },
  bodyContent: { gap: 14, paddingBottom: 30 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#18181b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: '#27272a' },
  statusBadgeText: { color: '#a1a1aa', fontSize: 13, fontWeight: '600' },
  trainingBadge: { backgroundColor: 'rgba(16,185,129,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  trainingBadgeTxt: { color: '#10b981', fontSize: 13, fontWeight: '700' },
  startBadge: { backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100 },
  startBadgeTxt: { color: '#000000', fontSize: 13, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, padding: 14, borderRadius: 18, backgroundColor: '#09090b', borderWidth: 1, borderColor: '#27272a', overflow: 'hidden' },
  cardLabel: { color: '#a1a1aa', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginBottom: 8 },
  cardVal: { fontSize: 22, fontWeight: '900', fontFamily: 'monospace', color: '#ffffff' },
  cardSub: { fontSize: 13, color: '#a1a1aa', fontWeight: 'normal' },
  chartsRow: { flexDirection: 'row', gap: 10 },
  chartCard: { flex: 1, padding: 12, borderRadius: 18, backgroundColor: '#09090b', borderWidth: 1, borderColor: '#27272a', overflow: 'hidden' },
  chartLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', color: '#ffffff' },
  chartVal: { fontSize: 13, fontWeight: '800', fontFamily: 'monospace', color: '#ffffff' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressBar: { flex: 1, height: 6, backgroundColor: '#27272a', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressTxt: { color: '#a1a1aa', fontSize: 13, fontWeight: '700', width: 36, textAlign: 'right' },
  stopBtnWrap: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#ffffff' },
  stopBtn: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  stopBtnDisabled: { backgroundColor: '#18181b', borderColor: '#27272a' },
  stopTxt: { color: '#000000', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  stopTxtDisabled: { color: '#52525b' },
  console: { flex: 1, borderRadius: 18, borderWidth: 1, borderColor: '#27272a', overflow: 'hidden', backgroundColor: '#09090b' },
  consoleBar: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#27272a', backgroundColor: '#09090b' },
  macDot: { color: '#ef4444', fontSize: 12 },
  consoleTitle: { color: '#ffffff', fontSize: 13, fontWeight: '600', flex: 1, letterSpacing: 0.3 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10b981', marginRight: 8 },
  consoleRight: { color: '#a1a1aa', fontSize: 11 },
  noLogs: { color: '#a1a1aa', fontSize: 13, fontFamily: 'monospace', textAlign: 'center', marginTop: 20, lineHeight: 22 },
  logLine: { color: '#d4d4d8', fontSize: 12, fontFamily: 'monospace', lineHeight: 20, marginBottom: 3 },
  logTs: { color: '#52525b' },
  matrixCard: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#27272a', backgroundColor: '#09090b', marginTop: 0 },
  matrixHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#27272a', backgroundColor: '#09090b' },
  matrixTitle: { color: '#ffffff', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  matrixClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center' },
  matrixImg: { width: '100%', height: 280 },
  overlayTop: { flex: 1, backgroundColor: OVERLAY },
  overlaySide: { flex: 1, backgroundColor: OVERLAY },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: '#10b981', borderWidth: 0 },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  laser: { width: '100%', height: 3, backgroundColor: '#ffffff', shadowColor: '#ffffff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10 },
  scanHint: { color: '#a1a1aa', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
  scanTopBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 54, paddingBottom: 14, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#000000', borderBottomWidth: 1, borderBottomColor: '#27272a' },
  closeCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a', justifyContent: 'center', alignItems: 'center' },
  closeTxt: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  rescanWrap: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center' },
  rescanBtn: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 100, borderWidth: 1, borderColor: '#27272a', backgroundColor: '#09090b', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 5 },
  rescanTxt: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});

const cs = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', paddingBottom: 40, backgroundColor: '#09090b', borderWidth: 1, borderColor: '#27272a', elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.5, shadowRadius: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3f3f46', alignSelf: 'center', marginTop: 14, marginBottom: 4 },
  sheetContent: { padding: 22, gap: 4 },
  sheetTitle: { color: '#ffffff', fontSize: 22, fontWeight: '800', letterSpacing: 0.3, marginBottom: 2 },
  sheetSub: { color: '#a1a1aa', fontSize: 14, marginBottom: 18 },
  label: { color: '#a1a1aa', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  modelChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1, borderColor: '#27272a', backgroundColor: '#18181b', marginRight: 8 },
  modelChipActive: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  modelChipTxt: { color: '#d4d4d8', fontSize: 13, fontWeight: '600' },
  modelChipActiveTxt: { color: '#000000' },
  paramsGrid: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  paramWrap: { flex: 1 },
  input: { backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: '#ffffff', fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  presetsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  presetBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a', alignItems: 'center' },
  presetTxt: { color: '#d4d4d8', fontSize: 14, fontWeight: '600' },
  actionBtnPrimary: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', backgroundColor: '#ffffff', marginBottom: 12 },
  actionBtnTxt: { color: '#000000', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  actionBtnSecondary: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a', marginBottom: 12 },
  actionBtnSecondaryTxt: { color: '#d4d4d8', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelTxt: { color: '#a1a1aa', fontSize: 15, fontWeight: '600' },
  datasetBtn: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, marginBottom: 18, borderRadius: 14, backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a' },
  datasetIcon: { fontSize: 24 },
  datasetPath: { color: '#ffffff', fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
  datasetPlaceholder: { color: '#a1a1aa', fontSize: 14, fontStyle: 'italic' },
  datasetArrow: { color: '#52525b', fontSize: 18, fontWeight: '700' },
});
