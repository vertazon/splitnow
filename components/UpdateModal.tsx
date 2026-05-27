import { Modal, View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';

type Props = {
  visible: boolean;
  force: boolean;       // true = no dismiss option
  message: string;
  storeUrl: string;
  onDismiss: () => void;
};

export function UpdateModal({ visible, force, message, storeUrl, onDismiss }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={force ? undefined : onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>🚀</Text>
          </View>

          <Text style={styles.title}>Update Available</Text>
          <Text style={styles.body}>{message}</Text>

          <TouchableOpacity
            style={styles.cta}
            activeOpacity={0.85}
            onPress={() => Linking.openURL(storeUrl)}
          >
            <Text style={styles.ctaText}>Update Now</Text>
          </TouchableOpacity>

          {!force && (
            <TouchableOpacity
              style={styles.dismiss}
              activeOpacity={0.7}
              onPress={onDismiss}
            >
              <Text style={styles.dismissText}>Maybe Later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderEmphasis,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontFamily: fonts.syne,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  cta: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
    marginTop: 4,
  },
  ctaText: {
    fontFamily: fonts.syne,
    fontSize: 15,
    color: '#000',
  },
  dismiss: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  dismissText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
  },
});
