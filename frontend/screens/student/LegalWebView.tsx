import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../theme/ThemeProvider';
import { theme } from '../../theme';
import { ConfirmModal } from '../../components/ConfirmModal';

export default function StudentLegalWebViewScreen({ route }: { route: any }) {
  const { mode } = useTheme();
  const styles = useMemo(() => makeStyles(mode), [mode]);

  const title = String(route?.params?.title || 'Document');
  const url = String(route?.params?.url || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!url) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>{title}</Text>
          <Text style={styles.centerSub}>URL not configured.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={styles.safe}>
        {loading && (
          <View style={styles.loadingBar}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.loadingTxt}>Loading…</Text>
          </View>
        )}

        <WebView
          source={{ uri: url }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError('Could not load this page.');
          }}
          onHttpError={() => {
            setLoading(false);
            setError('Page returned an error.');
          }}
          startInLoadingState
        />

        <ConfirmModal
          visible={!!error}
          tone="neutral"
          label="ERROR"
          title="Failed to open"
          description={error ?? ''}
          showCancel={false}
          confirmText="OK"
          confirmIcon="warning"
          onCancel={() => setError(null)}
          onConfirm={() => setError(null)}
        />
      </View>
    </SafeAreaView>
  );
}

function makeStyles(_mode: 'light' | 'dark') {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    loadingBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    loadingTxt: { fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    centerTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
    centerSub: { marginTop: 8, fontSize: 13, fontWeight: '700', color: theme.colors.mutedText, textAlign: 'center' },
  });
}

