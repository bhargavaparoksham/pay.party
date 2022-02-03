import React from "react";
import { Box, Text, HStack, Tooltip } from "@chakra-ui/react";
import { useColorModeValue } from "@chakra-ui/color-mode";
import QDIcon from "./Icons/QDIcon";
// displays a page header

export default function Header() {
  // Chakra UI color mode
  const headingColor = useColorModeValue("#6e3ff5", "#f1c100");
  return (
    <Box pb={0}>
      <HStack>
        <QDIcon size={24} />
        <Text color={headingColor} fontSize="5xl">
          <Tooltip label="Tool to distribute compensation to team members based on democratic principles">
            pay.party
          </Tooltip>
        </Text>
      </HStack>
    </Box>
  );
}
