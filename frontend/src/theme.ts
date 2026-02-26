import { createTheme, responsiveFontSizes } from '@mui/material/styles';

let theme = createTheme({
  components: {
    MuiContainer: {
      defaultProps: {
        maxWidth: false,
      },
    },
  },
});

theme = responsiveFontSizes(theme);

export default theme;
