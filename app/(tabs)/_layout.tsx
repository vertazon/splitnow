import { Tabs } from 'expo-router';
import { Platform, Text, View, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
      <Text
        style={[styles.tabLabel, focused && styles.tabLabelActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {focused && <View style={styles.pip} />}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(12,12,12,0.97)',
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingTop: 10,
          paddingBottom: Platform.OS === 'ios' ? 26 : 10,
          position: 'absolute',
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🏠" label="HOME" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🗂️" label="GROUPS" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="➕" label="ADD" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📊" label="INSIGHTS" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="👥" label="FRIENDS" focused={focused} />
          ),
        }}
      />

      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    alignItems: 'center',
    gap: 3,
    minWidth: 56,
  },
  tabEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  tabLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.text3,
  },
  tabLabelActive: {
    color: colors.accent,
  },
  pip: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginTop: 2,
  },
});
