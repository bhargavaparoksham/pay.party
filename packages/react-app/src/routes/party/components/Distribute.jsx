import { NumberInput, NumberInputField, Box, Button, Input, HStack, Spacer, Text, Center } from "@chakra-ui/react";
import React, { useState, useEffect } from "react";
import { toWei } from "web3-utils";
import { BigNumber, ethers } from "ethers";
import $ from "jquery";


import { useSafeAppsSDK } from '@gnosis.pm/safe-apps-react-sdk';



export const Distribute = ({
  partyData,
  address,
  userSigner,
  readContracts,
  writeContracts,
  tx,
  distribution,
  strategy,
  isSmartContract
}) => {
  const [tokenInstance, setTokenInstance] = useState(null);
  const [amounts, setAmounts] = useState(null);
  const [total, setTotal] = useState();
  const [isDistributionLoading, setIsDistributionLoading] = useState(false);
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  const [isApprovalLoading, setIsApprovalLoading] = useState(false);
  const [token, setToken] = useState(null);
  const [hasApprovedAllowance, setHasApprovedAllowance] = useState(false);
  const [addresses, setAddresses] = useState([]);

  const handleTokenChange = e => {
    setToken(e.target.value);
  };

  // load an erc20
  // TODO: add capability for other block explorers
  const loadToken = async () => {
    setIsTokenLoading(true);
    $.getJSON(
      `https://api.etherscan.io/api?module=contract&action=getabi&address=${token}&${process.env.REACT_APP_ETHERSCAN_KEY}`,
      data => {
        if (data.status === "0") {
          setTokenInstance(null);
          setIsTokenLoading(false);
        } else if (data.status === "1") {
          const ABI = JSON.parse(data.result);
          let contractInstance = new ethers.Contract(token, ABI, userSigner);
          setTokenInstance(contractInstance);
          setIsTokenLoading(false);
        }
      },
    );
  };

  const handleApproval = res => {
    if (res && (res.status === "confirmed" || res.status === 1)) {
      console.log(" 🍾 Transaction " + res.hash + " finished!");
      setHasApprovedAllowance(true);
      setIsApprovalLoading(false);
    } else {
      setHasApprovedAllowance(false);
      setIsApprovalLoading(false);
    }
  };

  // Approve total token amount
  const approve = async () => {
    setIsApprovalLoading(true);
    tx(tokenInstance?.approve(readContracts.Distributor.address, total), handleApproval);
  };

  // Update the distrubtion amounts when input total changes
  const handleAmountChange = async e => {
    if (distribution && distribution.length > 0) {
      const validDistribution = distribution.filter(d => d.score !== 0);

      const validAdrs = [];
      const validScores = [];

      for (let i = 0; i < validDistribution.length; i++) {
        validAdrs.push(validDistribution[i].address);
        validScores.push(validDistribution[i].score);
      }

      const amt = Number(e);
      const adrs = [];
      const amts = [];
      let tot = BigNumber.from("0x00");
      for (let i = 0; i < validAdrs.length; i++) {
        let pay = (validScores[i] * amt).toFixed(16).toString();
        const x = BigNumber.from(toWei(pay));
        amts.push(x);
        adrs.push(validAdrs[i]);
        tot = tot.add(x);
      }
      setTotal(tot);
      setAmounts(amts);
      setAddresses(adrs);
    }
    // Check ERC20 allowance
    // if (total && tokenInstance) {
    //   const allowance = await tokenInstance.allowance(address, readContracts.Distributor.address);
    //   setHasApprovedAllowance(allowance.gte(total));
    // }
  };

  const handleReceipt = res => {
    if (res && res.hash && (res.status === "confirmed" || res.status === 1)) {
      console.log(" 🍾 Transaction " + res.hash + " finished!");
      const receipt = {
        account: address,
        amount: total.toHexString(),
        token: tokenInstance?.address,
        txn: res.hash,
      };
      fetch(`${process.env.REACT_APP_API_URL}/party/${partyData.id}/distribute`, {
        method: "put",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(receipt),
      });
    }
    setIsDistributionLoading(false);
  };

  const handleSafeReceipt = res => {
    if (res && res.hash && (res.status === "confirmed" || res.status === 1)) {
      console.log(" 🍾 Transaction " + res.hash + " finished!");
      const receipt = {
        account: address,
        amount: total.toHexString(),
        token: tokenInstance?.address,
        txn: res.hash,
      };
      dbInstance.addPartyReceipt(partyData.id, receipt);
    }
    setIsDistributionLoading(false);
  };

  // Distribute either Eth, or loaded erc20
  const distribute = () => {
    try {
      if (partyData && partyData.ballots.length > 0) {
        setIsDistributionLoading(true);
        // Distribute the funds
        if (tokenInstance && amounts && addresses) {
          // Distribute Token
          tx(
            writeContracts.Distributor.distributeToken(tokenInstance.address, addresses, amounts, partyData.id),
            handleReceipt,
          );
        } else {
          // Distribute Ether
          tx(
            writeContracts.Distributor.distributeEther(addresses, amounts, partyData.id, { value: total }),
            handleReceipt,
          );
        }
      }
    } catch {
      setIsDistributionLoading(false);
    }
  };

  const DistributeButton = () => {
    return (
      <>
        {tokenInstance && (
          <Button onClick={approve} isLoading={isApprovalLoading}>
            Approve
          </Button>
        )}
        <Button onClick={distribute} isLoading={isDistributionLoading}>
          Distribute
        </Button>
      </>
    );
  };

  //   const { sdk, connected, safe } = useSafeAppsSDK();
  // useEffect(async () => {
  //   console.log(sdk, connected, safe)
  
  //   const txs = [
  //     {
  //       to: address,
  //       value: '0',
  //       data: '0xbaddad',
  //     },
  //     //...
  //   ];
  //   // Returns a hash to identify the Safe transaction
  //   const safeTxHash = await sdk.txs.send({ txs });
  // }, [])
 

  return (
    <Box>
      <Center pb="10" pt="10">
        <Text fontSize="lg">Distribute Funds</Text>
      </Center>
      <HStack>
        <Input onChange={handleTokenChange} placeholder="ex: 0xde30da39c46104798bb5aa3fe8b9e0e1f348163f"></Input>
        <Spacer />
        <Button onClick={loadToken} isLoading={isTokenLoading}>
          Load Token
        </Button>
      </HStack>
      <HStack pt={4}>
        <Spacer />
        <NumberInput onChange={handleAmountChange}>
          <NumberInputField placeholder="1" />
        </NumberInput>
        <DistributeButton />
      </HStack>
    </Box>
  );
};
