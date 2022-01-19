import React from "react";
import { ChakraProvider, ColorModeScript } from "@chakra-ui/react";
import "@fontsource/space-mono";
import "@fontsource/inter";
import "@fontsource/poppins";

import ReactDOM from "react-dom";
import App from "./App";
import "./index.css";
import { colorModeConfig, theme } from "./styles/customTheme";
import SafeProvider from "@gnosis.pm/safe-apps-react-sdk";

ReactDOM.render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={colorModeConfig.initialColorMode} />
      <SafeProvider>
        <App />
      </SafeProvider>
    </ChakraProvider>
  </React.StrictMode>,
  document.getElementById("root"),
);
