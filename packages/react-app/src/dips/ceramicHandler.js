import React, { useState, useEffect, useRef } from "react";
import { fromWei, toWei, toBN, numberToHex } from "web3-utils";
import { Caip10Link } from "@ceramicnetwork/stream-caip10-link";

import { ethers } from "ethers";
import Web3Modal from "web3modal";
import { TileDocument } from "@ceramicnetwork/stream-tile";
import axios from "axios";
import Diplomat from "../contracts/hardhat_contracts.json";
import { makeCeramicClient } from "../helpers";
import { getCeramicElectionIds, getNetwork, serializeCeramicElection, toCeramicId } from "./helpers";
import { serverUrl } from "./baseHandler";

export default function CeramicHandler(
  tx,
  readContracts,
  writeContracts,
  mainnetProvider,
  address,
  userSigner,
  targetNetwork,
) {
  const createElection = async ({
    name,
    description,
    voters,
    candidates,
    fundAmount,
    fundAmountInWei,
    tokenAdr,
    voteAllocation,
    kind,
  }) => {
    // console.log("createElection", targetNetwork);
    // console.log({ targetNetwork });
    /* CREATE CERAMIC ELECTION */
    const { ceramic, idx, schemasCommitId } = await makeCeramicClient(address);
    // current users' existing elections
    const existingElections = await idx.get("elections");
    const previousElections = existingElections ? Object.values(existingElections) : null;

    // make sure the user is Authenticated
    if (ceramic?.did?.id && targetNetwork) {
      // console.log({ targetNetwork });
      // create the election document on Ceramic
      const electionDoc = await TileDocument.create(
        ceramic,
        {
          name: name,
          description: description,
          voters: voters,
          candidates: candidates,
          creator: address,
          kind: "ceramic",
          voteAllocation: voteAllocation,
          tokenAddress: tokenAdr,
          fundAmount: fundAmount.toString(),
          fundAmountInWei: fundAmountInWei,
          createdAt: new Date().toISOString(),
          isActive: true,
          isPaid: false,
        },
        {
          // owner of the document
          controllers: [ceramic.did.id],
          family: "election",
          // schemaId to be used to validate the submitted data
          schema: schemasCommitId.election,
        },
      );
      // https://developers.ceramic.network/learn/glossary/#anchor-commit
      // https://developers.ceramic.network/learn/glossary/#anchor-service

      const electionId = electionDoc.id.toUrl();

      // console.log({ targetNetwork });

      /* CREATE ELECTION ON-CHAIN (push the ceramic commitId to elections array) */
      let contract = new ethers.Contract(
        Diplomat[targetNetwork.chainId][targetNetwork.name].contracts.Diplomat.address,
        Diplomat[targetNetwork.chainId][targetNetwork.name].contracts.Diplomat.abi,
        userSigner,
      );

      return contract
        .createElection(electionId)
        .then(async tx => {
          // console.log({ tx });
          const receipt = await tx.wait();
          const id = receipt.events[0].args.electionId;
          // console.log({ id });
          return id;
        })
        .catch(err => {
          console.log(err);
          return err;
        });
    }
  };

  const endElection = async id => {
    const { idx, ceramic } = await makeCeramicClient(address);
    const electionDoc = await TileDocument.load(ceramic, id);
    // console.log(electionDoc.controllers[0], ceramic.did.id.toString());
    if (electionDoc.controllers[0] === ceramic.did.id.toString()) {
      // console.log(electionDoc.content);
      await electionDoc.update({ ...electionDoc.content, isActive: false });
      // console.log("updated");
      return "success";
    } else {
      return null;
    }
  };

  const castBallot = async (id, candidates, quad_scores) => {
    const { idx, ceramic, schemasCommitId } = await makeCeramicClient(address);
    const election = await serializeCeramicElection(id, address, ceramic, idx, targetNetwork);

    // console.log({ election });
    const existingVotes = await idx.get("votes");

    // TODO: check if already voted for this election through another address linked to this did
    const previousVotes = existingVotes ? Object.values(existingVotes) : null;
    const hasAlreadyVotedForElec = previousVotes && previousVotes.find(vote => vote.electionId === id);
    if (hasAlreadyVotedForElec) {
      console.error("Already voted for this election");
      return election.totalScores;
    }

    // console.log({ quad_scores });

    const voteAttribution = quad_scores.map((voteAttributionCount, i) => ({
      address: election.candidates[i],
      voteAttribution: voteAttributionCount,
    }));

    // console.log({ voteAttribution });

    if (ceramic?.did?.id) {
      const ballotDoc = await TileDocument.create(ceramic, voteAttribution, {
        controllers: [ceramic.did.id],
        family: "vote",
        schema: schemasCommitId.vote,
      });
      // https://developers.ceramic.network/learn/glossary/#anchor-commit
      // https://developers.ceramic.network/learn/glossary/#anchor-service
      const anchorStatus = await ballotDoc.requestAnchor();
      await ballotDoc.makeReadOnly();
      Object.freeze(ballotDoc);

      const previousVotes = (await idx.get("votes", ceramic.did.id)) || {};
      await idx.set("votes", [
        { id: ballotDoc.id.toUrl(), electionId: toCeramicId(id) },
        ...Object.values(previousVotes),
      ]);

      const sealedBallot = ballotDoc.commitId.toUrl();
    } else {
      console.log("ceramic did not found");
    }

    const electionResults = await serializeCeramicElection(id, address, ceramic, idx, targetNetwork);
    // console.log({ election });
    return electionResults.totalScores;
  };

  const getElections = async () => {
    const contract = readContracts.Diplomat;
    const elections = await getCeramicElectionIds(contract);
    const newElectionsMap = new Map();
    const { idx, ceramic } = await makeCeramicClient();

    for (let i = 0; i < elections.length; i++) {
      const election = await serializeCeramicElection(elections[i], address, ceramic, idx, targetNetwork);
      newElectionsMap.set(elections[i], election);
    }
    return newElectionsMap;
  };

  const getElectionStateById = async id => {
    const { idx, ceramic } = await makeCeramicClient();
    const election = await serializeCeramicElection(id, address, ceramic, idx, targetNetwork);
    return election;
  };

  const getCandidatesScores = async id => {
    const { idx, ceramic } = await makeCeramicClient();
    const election = await serializeCeramicElection(id, address, ceramic, idx, targetNetwork);
    return election.totalScores;
  };

  const getFinalPayout = async id => {
    const { idx, ceramic } = await makeCeramicClient();
    const election = await serializeCeramicElection(id, address, ceramic, idx, targetNetwork);
    let payout = [];
    // console.log({ payout });
    let totalScoresSum = election.totalScores.reduce((sum, curr) => sum + curr, 0);
    let scores = [];

    for (let i = 0; i < election.candidates.length; i++) {
      const candidateScore = election.votes[election.candidates[i]];
      // console.log({ candidateScore });
      let scoreSum = 0;
      if (!candidateScore) {
        scores.push(candidateScore);
        scoreSum += candidateScore;
      } else {
        scores.push(0);
      }
    }

    for (let i = 0; i < election.totalScores.length; i++) {
      const candidatePay = Math.floor((election.totalScores[i] / totalScoresSum) * election.fundAmount);
      if (!isNaN(candidatePay)) {
        payout.push(fromWei(candidatePay.toString()));
      } else {
        payout.push(0);
      }
    }
    return {
      scores: election.totalScores,
      payout: payout,
      scoreSum: totalScoresSum,
    };
  };

  const distributeEth = async ({ id, candidates, payoutInWei, totalValueInWei, tokenAddress }) => {
    const { ceramic } = await makeCeramicClient(address);
    const contract = new ethers.Contract(
      Diplomat[targetNetwork.chainId][targetNetwork.name].contracts.Diplomat.address,
      Diplomat[targetNetwork.chainId][targetNetwork.name].contracts.Diplomat.abi,
      userSigner,
    );

    // console.log({ id, candidates, tokenAddress, totalValueInWei, payoutInWei });
    try {
      const transaction = await contract.payElection(id, candidates, payoutInWei, tokenAddress, {
        value: totalValueInWei,
      });
      const receipt = await transaction.wait();
      // console.log({ receipt });
      const electionDoc = await TileDocument.load(ceramic, id);
      //   console.log(electionDoc.controllers[0], ceramic.did.id.toString());
      if (electionDoc.controllers[0] === ceramic.did.id.toString()) {
        await electionDoc.update({ ...electionDoc.content, isPaid: true });
      }
      return receipt;
    } catch (e) {
      console.log("error in distribute eth handler");
      return "error";
    }
  };

  const distributeTokens = async ({ id, candidates, payoutInWei, tokenAddress }) => {
    const { ceramic } = await makeCeramicClient(address);
    const contract = new ethers.Contract(
      Diplomat[targetNetwork.chainId][targetNetwork.name].contracts.Diplomat.address,
      Diplomat[targetNetwork.chainId][targetNetwork.name].contracts.Diplomat.abi,
      userSigner,
    );

    // console.log({ id, candidates, tokenAddress, payoutInWei });
    try {
      const transaction = await contract.payElection(id, candidates, payoutInWei, tokenAddress);
      const receipt = await transaction.wait();
      console.log({ receipt });
      const electionDoc = await TileDocument.load(ceramic, id);
      // console.log(electionDoc.controllers[0], ceramic.did.id.toString());
      if (electionDoc.controllers[0] === ceramic.did.id.toString()) {
        await electionDoc.update({ ...electionDoc.content, isPaid: true });
      }
      return receipt;
    } catch (e) {
      console.log("error in handler");
      return null;
    }
  };

  const sendBackendOnCreate = async (newElection, address) => {};

  return {
    createElection,
    endElection,
    getElections,
    getElectionStateById,
    castBallot,
    getCandidatesScores,
    getFinalPayout,
    distributeEth,
    distributeTokens,
    sendBackendOnCreate,
  };
}
