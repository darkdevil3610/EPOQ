import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, router } from 'expo-router';
import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Alert, TouchableOpacity, Dimensions } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
const scanBoxSize = 280;

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const scanLineY = useSharedValue(0);

  useEffect(() => {
    scanLineY.value = withRepeat(
      withSequence(
        withTiming(scanBoxSize - 4, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineY.value }],
  }));

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Stack.Screen options={{ title: 'Scanner', headerShown: false }} />
        <LinearGradient colors={['#020617', '#0f172a']} style={StyleSheet.absoluteFillObject} />
        <IconSymbol name="camera.viewfinder" size={100} color="#10b981" />
        <Text style={styles.permissionTitle}>Camera Access</Text>
        <Text style={styles.permissionMessage}>We need your permission to access the camera to scan the EPOQ QR Code.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission} activeOpacity={0.8}>
          <LinearGradient colors={['#10b981', '#059669']} style={styles.permissionGradient} start={{x:0,y:0}} end={{x:1,y:1}}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setScanned(true);
    try {
      const parsedData = JSON.parse(data);
      if (parsedData.ip && parsedData.port && parsedData.token) {
        Alert.alert(
          "EPOQ Desktop Found",
          `IP: ${parsedData.ip}\nPort: ${parsedData.port}`,
          [
            { 
              text: "Connect", 
              onPress: () => {
                router.replace({
                  pathname: "/(tabs)/dashboard",
                  params: {
                    ip: parsedData.ip,
                    port: parsedData.port,
                    token: parsedData.token
                  }
                });
              } 
            },
            {
              text: "Cancel",
              onPress: () => setTimeout(() => setScanned(false), 500),
              style: "cancel"
            }
          ]
        );
      } else {
        throw new Error("Invalid format");
      }
    } catch (e) {
      Alert.alert("Invalid QR Code", "Please scan a valid connection code from the EPOQ desktop app.");
      setTimeout(() => setScanned(false), 2000);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      />
      
      {/* Dark semi-transparent overlay using borders to create a cutout */}
      <View style={styles.overlay}>
        <View style={styles.unfocusedContainer} />
        <View style={styles.middleContainer}>
          <View style={styles.unfocusedContainer} />
          <View style={styles.scanBoxWrapper}>
            <View style={styles.scanBox}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              <Animated.View style={[styles.laser, animatedLineStyle]} />
            </View>
          </View>
          <View style={styles.unfocusedContainer} />
        </View>
        <View style={styles.unfocusedContainer}>
          <Text style={styles.instructionText}>
            Align the QR code within the frame to connect.
          </Text>
        </View>
      </View>

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan to Connect</Text>
        <View style={{ width: 28 }} />
      </View>

      {scanned && (
        <View style={styles.scannedFooter}>
          <TouchableOpacity 
            style={styles.rescanButton} 
            onPress={() => setScanned(false)}
            activeOpacity={0.8}
          >
            <LinearGradient colors={['#334155', '#1e293b']} style={styles.rescanGradient}>
              <IconSymbol name="arrow.triangle.2.circlepath" size={20} color="#10b981" />
              <Text style={styles.rescanText}>Tap to Scan Again</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const overlayColor = 'rgba(2, 6, 23, 0.85)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#020617',
  },
  permissionTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 20,
    marginBottom: 10,
  },
  permissionMessage: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 40,
  },
  permissionButton: {
    width: '100%',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  permissionGradient: {
    paddingVertical: 18,
    borderRadius: 100,
    alignItems: 'center',
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  backButton: {
    marginTop: 20,
    padding: 10,
  },
  backButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  
  header: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  headerButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  unfocusedContainer: {
    flex: 1,
    backgroundColor: overlayColor,
  },
  middleContainer: {
    flexDirection: 'row',
    height: scanBoxSize,
  },
  scanBoxWrapper: {
    width: scanBoxSize,
    height: scanBoxSize,
  },
  scanBox: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#10b981',
    borderWidth: 0,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 20,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 20,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 20,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 20,
  },
  laser: {
    width: '100%',
    height: 3,
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 8,
  },
  instructionText: {
    color: '#cbd5e1',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  scannedFooter: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  rescanButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
    width: 240,
  },
  rescanGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  rescanText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  }
});
