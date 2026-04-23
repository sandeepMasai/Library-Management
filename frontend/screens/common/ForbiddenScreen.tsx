import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../theme';

export default function ForbiddenScreen(props: { message?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 8 }}>Access blocked</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.mutedText, textAlign: 'center' }}>
        {props.message ?? 'You do not have permission to view this page.'}
      </Text>
    </View>
  );
}

