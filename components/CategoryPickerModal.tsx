import { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, ScrollView,
  TouchableOpacity, StyleSheet, Pressable,
  useWindowDimensions, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { categories, categoryGroups } from '@/constants/sampleData';
import type { Category } from '@/constants/sampleData';

interface Props {
  visible: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function CategoryPickerModal({ visible, selectedId, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [kbHeight, setKbHeight] = useState(0);
  const { height } = useWindowDimensions();

  // Track keyboard height so we can pad the bottom of the scroll list
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', e => {
      setKbHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKbHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q.length > 0
    ? categories.filter(c => c.label.toLowerCase().includes(q))
    : null;

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
    setQuery('');
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
    setQuery('');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/*
        Sheet stays pinned to the bottom at a fixed height. When the keyboard
        opens, we don't move the sheet — instead, we pad the scroll list so
        the user can scroll past the keyboard. Search input is at the top of
        the sheet, so it's always visible above the keyboard.
      */}
      <View style={styles.overlay}>
        <Pressable style={styles.scrim} onPress={handleClose} />

        <View style={[styles.sheet, { height: height * 0.82 }]}>
          <SafeAreaView edges={['bottom']} style={styles.sheetInner}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>All Categories</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search categories…"
                placeholderTextColor={colors.text3}
                selectionColor={colors.accent}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {query.length > 0 && (
                <TouchableOpacity
                  onPress={() => setQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.clearBtn}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* List — pads bottom by keyboard height so content can scroll above it */}
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: 48 + kbHeight },
              ]}
            >
              {filtered !== null ? (
                filtered.length > 0 ? (
                  <View style={styles.group}>
                    {filtered.map(cat => (
                      <CategoryRow
                        key={cat.id}
                        cat={cat}
                        selected={cat.id === selectedId}
                        onPress={() => handleSelect(cat.id)}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>No categories found</Text>
                )
              ) : (
                categoryGroups.map(group => {
                  const cats = categories.filter(c => c.group === group.id);
                  if (!cats.length) return null;
                  return (
                    <View key={group.id} style={styles.group}>
                      <Text style={styles.groupLabel}>{group.label}</Text>
                      {cats.map(cat => (
                        <CategoryRow
                          key={cat.id}
                          cat={cat}
                          selected={cat.id === selectedId}
                          onPress={() => handleSelect(cat.id)}
                        />
                      ))}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

function CategoryRow({ cat, selected, onPress }: { cat: Category; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.row, selected && styles.rowSelected]}
      onPress={onPress}
      activeOpacity={0.65}
    >
      <Text style={styles.rowEmoji}>{cat.emoji}</Text>
      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>{cat.label}</Text>
      {selected && <Text style={styles.checkmark}>✓</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  sheetInner: {
    flex: 1,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  headerTitle: {
    fontFamily: fonts.syne,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 12,
    color: colors.text2,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.borderEmphasis,
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: { fontSize: 13 },
  searchInput: {
    flex: 1,
    fontFamily: fonts.dmSans,
    fontSize: 14,
    color: colors.text,
    padding: 0,
    margin: 0,
  },
  clearBtn: {
    fontSize: 11,
    color: colors.text3,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 48,
  },
  group: {
    marginBottom: 4,
  },
  groupLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 14,
  },
  rowSelected: {
    backgroundColor: colors.accentDim,
  },
  rowEmoji: {
    fontSize: 22,
    width: 30,
    textAlign: 'center',
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  rowLabelSelected: {
    color: colors.accent,
  },
  checkmark: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '800',
  },
  emptyText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text3,
    textAlign: 'center',
    paddingVertical: 36,
  },
});
