import { useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Container,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from '@mui/material';
import RadarIcon from '@mui/icons-material/Radar';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LockIcon from '@mui/icons-material/Lock';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuthStore } from '../stores/authStore';
import ChangePasswordDialog from './ChangePasswordDialog';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: 'Scans', path: '/scans' },
  { label: 'Providers', path: '/providers' },
  { label: 'Results', path: '/results' },
];

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { username, logout } = useAuthStore();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [pwDialogOpen, setPwDialogOpen] = useState(false);

  const currentTab = navItems.findIndex((item) => location.pathname.startsWith(item.path));

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <RadarIcon sx={{ mr: 1 }} />
          <Typography variant="h6" sx={{ mr: 4, cursor: 'pointer' }} onClick={() => navigate('/')}>
            a-scanner
          </Typography>
          <Tabs
            value={currentTab >= 0 ? currentTab : false}
            textColor="inherit"
            indicatorColor="secondary"
          >
            {navItems.map((item) => (
              <Tab key={item.path} label={item.label} onClick={() => navigate(item.path)} />
            ))}
          </Tabs>

          {/* Spacer pushes user menu to the right */}
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
      <Container maxWidth={false} sx={{ py: 4, flex: 1 }}>
        {children}
      </Container>

      <ChangePasswordDialog open={pwDialogOpen} onClose={() => setPwDialogOpen(false)} />
    </Box>
  );
}
