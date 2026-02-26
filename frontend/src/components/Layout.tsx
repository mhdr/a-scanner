import { useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import RadarIcon from '@mui/icons-material/Radar';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LockIcon from '@mui/icons-material/Lock';
import LogoutIcon from '@mui/icons-material/Logout';
import SearchIcon from '@mui/icons-material/Search';
import DnsIcon from '@mui/icons-material/Dns';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { useAuthStore } from '../stores/authStore';
import ChangePasswordDialog from './ChangePasswordDialog';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: 'Scans', path: '/scans', icon: <SearchIcon /> },
  { label: 'Providers', path: '/providers', icon: <DnsIcon /> },
  { label: 'Results', path: '/results', icon: <ListAltIcon /> },
];

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { username, logout } = useAuthStore();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [pwDialogOpen, setPwDialogOpen] = useState(false);

  const currentTab = navItems.findIndex((item) => location.pathname.startsWith(item.path));

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate('/login', { replace: true });
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          {isMobile && (
            <IconButton color="inherit" edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <RadarIcon sx={{ mr: 1 }} />
          <Typography
            variant="h6"
            sx={{ mr: { xs: 0, md: 4 }, cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            a-scanner
          </Typography>

          {!isMobile && (
            <Tabs
              value={currentTab >= 0 ? currentTab : false}
              textColor="inherit"
              indicatorColor="secondary"
            >
              {navItems.map((item) => (
                <Tab key={item.path} label={item.label} onClick={() => navigate(item.path)} />
              ))}
            </Tabs>
          )}

          <Box sx={{ flexGrow: 1 }} />

          <IconButton color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)}>
            <AccountCircleIcon />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem disabled>
              <ListItemText primary={username ?? 'admin'} secondary="Signed in" />
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                setPwDialogOpen(true);
              }}
            >
              <ListItemIcon>
                <LockIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Change Password</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Logout</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Mobile navigation drawer */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: 240 } }}
      >
        <Toolbar>
          <RadarIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" fontWeight="bold">
            a-scanner
          </Typography>
        </Toolbar>
        <Divider />
        <List>
          {navItems.map((item) => (
            <ListItemButton
              key={item.path}
              selected={location.pathname.startsWith(item.path)}
              onClick={() => handleNavClick(item.path)}
              sx={{ minHeight: 48 }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Container maxWidth={false} sx={{ py: { xs: 2, md: 4 }, px: { xs: 1.5, sm: 2, md: 3 }, flex: 1 }}>
        {children}
      </Container>

      <ChangePasswordDialog open={pwDialogOpen} onClose={() => setPwDialogOpen(false)} />
    </Box>
  );
}
