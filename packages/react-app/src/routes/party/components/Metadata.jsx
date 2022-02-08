import { Box, Text, Center, Tooltip } from "@chakra-ui/react";
import { QuestionOutlineIcon } from "@chakra-ui/icons";
import React from "react";

export const Metadata = ({ partyData, mainnetProvider, votesData, distribution, strategy }) => {
  return (
    <Box>
      <Center pt={4}>
        <Text fontSize="lg">Party</Text>
      </Center>
      <Center pt={4}>
        <Text fontSize="xl">{`${partyData.name}`}</Text>
      </Center>
      <Center pt={4} pl="5%" pr="5%">
        <Text fontSize="sm">{`${partyData.description}`}</Text>
      </Center>
      <Center p="4">
        <Text fontWeight="semibold" fontSize="lg">
          Voted:
          <Tooltip label="Number of people voted">
            <QuestionOutlineIcon w={4} h={4} />
          </Tooltip>
          {`${partyData?.ballots?.length}/${partyData?.participants?.length}`}
        </Text>
      </Center>
    </Box>
  );
};
