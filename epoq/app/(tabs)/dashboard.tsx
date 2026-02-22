import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface LogMessage {
  type: 'info' | 'error' | 'success';
  message: string;
  timestamp: string;
}

export default function DashboardScreen() {
  const { ip, port, token } = useLocalSearchParams();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  
  // Real-time training metrics state
  const [epoch, setEpoch] = useState(0);
  const [totalEpochs, setTotalEpochs] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [loss, setLoss] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!ip || !port || !token) {
      setError("Missing connection details.");
      return;
    }

    const connectWebSocket = () => {
      const wsUrl = `ws://${ip}:${port}`;
      console.log(`Connecting to ${wsUrl}...`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected. Sending auth token...");
        ws.send(JSON.stringify({ action: "auth", token }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.status === "authenticated") {
            setConnected(true);
            setError(null);
            addLog("Successfully authenticated with Desktop App", "success");
          } else if (data.status === "auth_failed") {
            setError("Authentication failed. Invalid token.");
            ws.close();
          } else if (data.status === "training") {
            // Training metrics update
            setIsTraining(true);
            setEpoch(data.epoch);
            setTotalEpochs(data.total_epochs);
            setAccuracy(parseFloat(data.train_accuracy));
            setLoss(parseFloat(data.train_loss));
          } else if (data.status === "stopped") {
            setIsTraining(false);
          } else if (data.type === "info" || data.type === "error" || data.type === "success") {
             // App format log
             addLog(data.message, data.type);
          } else if (data.message) {
             addLog(data.message, "info");
          } else {
             // Try to parse raw string if it's JSON from python
             if (typeof data === "string") {
                 try {
                     const parsed = JSON.parse(data);
                     if (parsed.status === "training") {
                        setIsTraining(true);
                        setEpoch(parsed.epoch);
                        setTotalEpochs(parsed.total_epochs);
                        setAccuracy(parseFloat(parsed.train_accuracy));
                        setLoss(parseFloat(parsed.train_loss));
                     }
                 } catch {
                     addLog(data, "info");
                 }
             }
          }
        } catch (e) {
            // If it's just a raw text log from Python
            if (typeof event.data === 'string') {
              try {
                // sometimes the string is raw JSON string, sometimes it's text
                const p = JSON.parse(event.data);
                if (p.status === 'training') {
                   setIsTraining(true);
                   setEpoch(p.epoch);
                   setTotalEpochs(p.total_epochs);
                   setAccuracy(parseFloat(p.train_accuracy));
                   setLoss(parseFloat(p.train_loss));
                } else {
                   addLog(event.data, "info");
                }
              } catch {
                addLog(event.data, "info");
              }
            }
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket Error:", e);
        setError("Connection error.");
      };

      ws.onclose = () => {
        console.log("WebSocket closed.");
        setConnected(false);
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [ip, port, token]);

  const addLog = (message: string, type: 'info' | 'error' | 'success') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, { type, message, timestamp }]);
  };

  const handleStopTraining = () => {
    if (wsRef.current && connected) {
      wsRef.current.send(JSON.stringify({ action: "stop_training" }));
      addLog("Sent stop command to Desktop", "info");
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#020617', '#0f172a', '#020617']} style={StyleSheet.absoluteFillObject} />

      {/* Header */}
      <LinearGradient 
        colors={['rgba(255,255,255,0.05)', 'transparent']}
        style={styles.header}
      >
        <View>
          <Text style={styles.title}>EPOQ Monitoring</Text>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: connected ? '#10b981' : '#f43f5e' }]} />
            <Text style={styles.statusText}>
              {connected ? `Connected to ${ip}` : error ? error : "Connecting..."}
            </Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.disconnectButton}
          onPress={() => router.replace('/')}
          activeOpacity={0.7}
        >
          <IconSymbol name="xmark.circle.fill" size={28} color="#94a3b8" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Main Content */}
      <View style={styles.content}>
        
        {/* Metrics Cards */}
        <View style={styles.metricsGrid}>
          <LinearGradient colors={['rgba(16,185,129,0.1)', 'rgba(255,255,255,0.03)']} style={styles.metricCard}>
            <Text style={styles.metricLabel}>Epochs</Text>
            <Text style={styles.metricValue}>
              {epoch} <Text style={styles.metricSub}>/ {totalEpochs || '-'}</Text>
            </Text>
          </LinearGradient>
          
          <LinearGradient colors={['rgba(56,189,248,0.1)', 'rgba(255,255,255,0.03)']} style={styles.metricCard}>
            <Text style={styles.metricLabel}>Accuracy</Text>
            <Text style={[styles.metricValue, {color: '#38bdf8'}]}>
              {(accuracy * 100).toFixed(1)}<Text style={styles.metricSub}>%</Text>
            </Text>
          </LinearGradient>
          
          <LinearGradient colors={['rgba(245,158,11,0.1)', 'rgba(255,255,255,0.03)']} style={styles.metricCard}>
            <Text style={styles.metricLabel}>Loss</Text>
            <Text style={[styles.metricValue, {color: '#f59e0b'}]}>
              {loss.toFixed(4)}
            </Text>
          </LinearGradient>
        </View>

        {/* Controls */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity 
            style={[styles.controlButtonWrapper, !isTraining && styles.controlButtonDisabled]}
            onPress={handleStopTraining}
            disabled={!isTraining || !connected}
            activeOpacity={0.8}
          >
            <LinearGradient 
              colors={isTraining ? ['#ef4444', '#b91c1c'] : ['#334155', '#1e293b']}
              style={styles.controlButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <IconSymbol name="stop.fill" size={20} color={isTraining ? "#ffffff" : "#64748b"} />
              <Text style={[styles.controlButtonText, !isTraining && styles.controlTextDisabled]}>
                Halt Execution
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Console Logs */}
        <View style={styles.consoleContainer}>
          <LinearGradient colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)']} style={styles.consoleHeader}>
            <IconSymbol name="terminal" size={16} color="#94a3b8" />
            <Text style={styles.consoleTitle}>Live Output Stream</Text>
            {isTraining && <View style={styles.pulsingIndicator} />}
          </LinearGradient>
          <ScrollView 
            ref={scrollViewRef}
            style={styles.consoleScroll}
            contentContainerStyle={styles.consoleContent}
            showsVerticalScrollIndicator={true}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {logs.map((log, index) => (
              <View key={index} style={styles.logRow}>
                <Text style={styles.logTime}>{log.timestamp}</Text>
                <Text style={[
                  styles.logMessage,
                  log.type === 'error' && styles.logError,
                  log.type === 'success' && styles.logSuccess,
                ]}>
                  {log.message}
                </Text>
              </View>
            ))}
            {logs.length === 0 && (
              <Text style={styles.emptyLogs}>Awaiting connection handshake...</Text>
            )}
          </ScrollView>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 3,
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  disconnectButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
    gap: 20,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  metricLabel: {
    color: '#94a3b8',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    fontWeight: '700',
  },
  metricValue: {
    color: '#10b981',
    fontSize: 26,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  metricSub: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: 'normal',
  },
  controlsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  controlButtonWrapper: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  controlButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  controlButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  controlTextDisabled: {
    color: '#64748b',
  },
  consoleContainer: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  consoleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  consoleTitle: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  pulsingIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginLeft: 'auto',
  },
  consoleScroll: {
    flex: 1,
  },
  consoleContent: {
    padding: 16,
  },
  logRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  logTime: {
    color: '#64748b',
    fontSize: 12,
    fontFamily: 'monospace',
    width: 65,
  },
  logMessage: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  logError: {
    color: '#f43f5e',
    fontWeight: '600',
  },
  logSuccess: {
    color: '#34d399',
    fontWeight: '600',
  },
  emptyLogs: {
    color: '#475569',
    fontSize: 13,
    fontFamily: 'monospace',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 30,
  }
});
