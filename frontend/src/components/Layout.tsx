import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Container,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from '@mui/material';
import RadarIcon from '@mui/icons-material/Radar';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: 'Scans', path: '/scans' },
  { label: 'Results', path: '/results' },
];

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const currentTab = navItems.findIndex((item) => location.pathname.startsWith(item.path));

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
        </Toolbar>
      </AppBar>
      <Container maxWidth={false} sx={{ py: 4, flex: 1 }}>
        {children}
      </Container>
    </Box>
  );
}
