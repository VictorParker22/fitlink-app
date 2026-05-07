import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const name = user?.user_metadata?.name || 'Trainer';
  const email = user?.email;
  const phone = user?.phone;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Profile</Text>

        {/* Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.gradientStrip} />
          <View style={styles.profileInfo}>
            <Avatar name={name} size="xl" />
            <Text style={styles.profileName}>{name}</Text>
            {email && <Text style={styles.profileDetail}>{email}</Text>}
            {phone && <Text style={styles.profileDetail}>{phone}</Text>}
          </View>
        </Card>

        {/* Menu */}
        <Card noPadding style={styles.menu}>
          {[
            { icon: 'trophy', label: 'Certifications', color: Colors.accent },
            { icon: 'barbell', label: 'Specializations', color: Colors.blue },
            { icon: 'settings', label: 'Settings', color: Colors.textSecondary },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.menuItem} activeOpacity={0.7}>
              <View style={styles.menuIcon}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </Card>

        {/* Sign Out */}
        <View style={styles.signOutSection}>
          <Button
            title="Sign Out"
            onPress={signOut}
            variant="danger"
            full
            icon={<Ionicons name="log-out-outline" size={18} color={Colors.red} />}
          />
        </View>

        <Text style={styles.version}>FitLink v1.0.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { padding: Spacing.lg },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize['2xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: Spacing.lg,
  },

  profileCard: {
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  gradientStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'rgba(255,95,59,0.08)',
  },
  profileInfo: {
    alignItems: 'center',
    paddingTop: Spacing['2xl'],
    paddingBottom: Spacing.base,
    gap: Spacing.xs,
  },
  profileName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.xl,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  profileDetail: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  menu: {
    marginBottom: Spacing.xl,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },

  signOutSection: {
    marginBottom: Spacing.xl,
  },

  version: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    opacity: 0.5,
  },
});
