import { useEffect, useState } from "react";
import styled from "styled-components";
import confetti from "canvas-confetti";
import * as anchor from "@project-serum/anchor";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-material-ui";
import { GatewayProvider } from "@civic/solana-gateway-react";
import Countdown from "react-countdown";
import { Snackbar, Paper, LinearProgress } from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";
import twitter from "./img/twitter.png"; // with import
import discord from "./img/discord.png"; // with import

import { toDate, AlertState, getAtaForMint } from "./utils";
import { MintButton } from "./MintButton";
import { CandyMachine, awaitTransactionSignatureConfirmation, getCandyMachineState, mintOneToken, CANDY_MACHINE_PROGRAM } from "./candy-machine";

const cluster = process.env.REACT_APP_SOLANA_NETWORK!.toString();

const WalletContainer = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
`;
const NFT = styled(Paper)`
  min-width: 400px;
  padding: 5px 20px 20px 20px;
  flex: 1 1 auto;
`;

const Card = styled(Paper)`
  display: inline-block;
  background-color: var(--card-background-lighter-color) !important;
  margin: 5px;
  padding: 24px;
`;

const MintButtonContainer = styled.div`
  button.MuiButton-contained:not(.MuiButton-containedPrimary).Mui-disabled {
    color: #2c394b;
  }

  button.MuiButton-contained:not(.MuiButton-containedPrimary):hover,
  button.MuiButton-contained:not(.MuiButton-containedPrimary):focus {
    -webkit-animation: pulse 1s;
    animation: pulse 1s;
    box-shadow: 0 0 0 2em rgba(255, 255, 255, 0);
  }

  @-webkit-keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 #ef8f6e;
    }
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 #ef8f6e;
    }
  }
`;

const WalletAmount = styled.div`
  color: var(--main-background-color);
  width: auto;
  height: 48px;
  padding: 0 5px 0 16px;
  min-width: 48px;
  min-height: auto;
  border-radius: 24px;
  background-color: var(--main-text-color);
  box-shadow: 0px 3px 5px -1px rgb(0 0 0 / 20%), 0px 6px 10px 0px rgb(0 0 0 / 14%), 0px 1px 18px 0px rgb(0 0 0 / 12%);
  box-sizing: border-box;
  transition: background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, border 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
  font-weight: 500;
  line-height: 1.75;
  text-transform: uppercase;
  border: 0;
  margin: 0;
  display: inline-flex;
  outline: 0;
  position: relative;
  align-items: center;
  user-select: none;
  vertical-align: middle;
  justify-content: flex-start;
  gap: 10px;
`;

const ConnectButton = styled(WalletMultiButton)``;
const Logo = styled.div`
  img {
    height: 60px;
  }
`;

const SolExplorerLink = styled.a`
  color: var(--title-text-color);
  border-bottom: 1px solid var(--title-text-color);
  font-weight: bold;
  list-style-image: none;
  list-style-position: outside;
  list-style-type: none;
  outline: none;
  text-decoration: none;
  text-size-adjust: 100%;

  :hover {
    border-bottom: 2px solid var(--title-text-color);
  }
`;

const Wallet = styled.ul`
  flex: 0 0 auto;
  margin: 0;
  padding: 0;
`;
const MainContainer = styled.div`
  display: flex;
  flex-direction: column;
  text-align: center;
  justify-content: center;
  background-color: var(--main-background-color);
  padding: 10px 20px;
`;

const MintContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Image = styled.img`
  width: 100%;
  border-radius: 20px;
  padding: 10px 0;
`;

const BorderLinearProgress = styled(LinearProgress)`
  margin: 20px 0;
  height: 10px !important;
  border-radius: 5px;
`;

const ShimmerTitle = styled.h1`
  margin: 50px auto;
  font-size: 50px;
  text-transform: uppercase;
  animation: glow 2s ease-in-out infinite alternate;
  color: var(--main-text-color);
  @keyframes glow {
    from {
      text-shadow: 0 0 20px var(--main-text-color);
    }
    to {
      text-shadow: 0 0 30px var(--title-text-color), 0 0 10px var(--title-text-color);
    }
  }
`;

export interface HomeProps {
  candyMachineId: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  txTimeout: number;
  rpcHost: string;
}

const Home = (props: HomeProps) => {
  const [balance, setBalance] = useState<number>();
  const [isMinting, setIsMinting] = useState(false); // true when user got to press MINT
  const [isActive, setIsActive] = useState(false); // true when countdown completes or whitelisted
  const [solanaExplorerLink, setSolanaExplorerLink] = useState("");
  const [itemsAvailable, setItemsAvailable] = useState(0);
  const [itemsRedeemed, setItemsRedeemed] = useState(0);
  const [itemsRemaining, setItemsRemaining] = useState(0);
  const [isSoldOut, setIsSoldOut] = useState(false);
  const [price, setPrice] = useState(0);
  const [whitelistPrice, setWhitelistPrice] = useState(0);
  const [whitelistEnabled, setWhitelistEnabled] = useState(false);
  const [whitelistTokenBalance, setWhitelistTokenBalance] = useState(0);

  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });

  const wallet = useAnchorWallet();
  const [candyMachine, setCandyMachine] = useState<CandyMachine>();

  const rpcUrl = props.rpcHost;

  const refreshCandyMachineState = () => {
    (async () => {
      if (!wallet) return;

      const cndy = await getCandyMachineState(wallet as anchor.Wallet, props.candyMachineId, props.connection);

      setCandyMachine(cndy);
      setItemsAvailable(cndy.state.itemsAvailable);
      setItemsRemaining(cndy.state.itemsRemaining);
      setItemsRedeemed(cndy.state.itemsRedeemed);
      setPrice(cndy.state.price.toNumber() / LAMPORTS_PER_SOL);
      setWhitelistPrice(cndy.state.price.toNumber() / LAMPORTS_PER_SOL);

      // fetch whitelist token balance
      if (cndy.state.whitelistMintSettings) {
        setWhitelistEnabled(true);
        if (cndy.state.whitelistMintSettings.discountPrice !== null && cndy.state.whitelistMintSettings.discountPrice !== cndy.state.price) {
          setWhitelistPrice(cndy.state.whitelistMintSettings.discountPrice?.toNumber() / LAMPORTS_PER_SOL);
        }
        let balance = 0;
        try {
          const tokenBalance = await props.connection.getTokenAccountBalance((await getAtaForMint(cndy.state.whitelistMintSettings.mint, wallet.publicKey))[0]);

          balance = tokenBalance?.value?.uiAmount || 0;
        } catch (e) {
          console.error(e);
          balance = 0;
        }
        setWhitelistTokenBalance(balance);
        setIsActive(balance > 0);
      } else {
        setWhitelistEnabled(false);
      }
    })();
  };

  const renderCounter = ({ days, hours, minutes, seconds }: any) => {
    return (
      <div>
        <Card elevation={1}>
          <h1>{days}</h1>
          <br />
          Days
        </Card>
        <Card elevation={1}>
          <h1>{hours}</h1>
          <br />
          Hours
        </Card>
        <Card elevation={1}>
          <h1>{minutes}</h1>
          <br />
          Mins
        </Card>
        <Card elevation={1}>
          <h1>{seconds}</h1>
          <br />
          Secs
        </Card>
      </div>
    );
  };

  function displaySuccess(mintPublicKey: any): void {
    let remaining = itemsRemaining - 1;
    setItemsRemaining(remaining);
    setIsSoldOut(remaining === 0);
    if (whitelistTokenBalance && whitelistTokenBalance > 0) {
      let balance = whitelistTokenBalance - 1;
      setWhitelistTokenBalance(balance);
      setIsActive(balance > 0);
    }
    setItemsRedeemed(itemsRedeemed + 1);
    const solFeesEstimation = 0.012; // approx
    if (balance && balance > 0) {
      setBalance(balance - (whitelistEnabled ? whitelistPrice : price) - solFeesEstimation);
    }
    setSolanaExplorerLink(cluster === "devnet" || cluster === "testnet" ? "https://explorer.solana.com/address/" + mintPublicKey + "?cluster=" + cluster : "https://explorer.solana.com/address/" + mintPublicKey);
    throwConfetti();
  }

  function throwConfetti(): void {
    confetti({
      particleCount: 400,
      spread: 70,
      origin: { y: 0.6 },
    });
  }

  const onMint = async () => {
    try {
      setIsMinting(true);
      document.getElementById("#identity")?.click();
      if (wallet && candyMachine?.program && wallet.publicKey) {
        const mint = anchor.web3.Keypair.generate();
        const mintTxId = (await mintOneToken(candyMachine, wallet.publicKey, mint))[0];

        let status: any = { err: true };
        if (mintTxId) {
          status = await awaitTransactionSignatureConfirmation(mintTxId, props.txTimeout, props.connection, "singleGossip", true);
        }

        if (!status?.err) {
          setAlertState({
            open: true,
            message: "Congratulations! Mint succeeded!",
            severity: "success",
          });

          // update front-end amounts
          displaySuccess(mint.publicKey);
        } else {
          setAlertState({
            open: true,
            message: "Mint failed! Please try again!",
            severity: "error",
          });
        }
      }
    } catch (error: any) {
      // TODO: blech:
      let message = error.msg || "Minting failed! Please try again!";
      if (!error.msg) {
        if (!error.message) {
          message = "Transaction Timeout! Please try again.";
        } else if (error.message.indexOf("0x138")) {
        } else if (error.message.indexOf("0x137")) {
          message = `SOLD OUT!`;
        } else if (error.message.indexOf("0x135")) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: "error",
      });
    } finally {
      setIsMinting(false);
    }
  };

  useEffect(() => {
    (async () => {
      if (wallet) {
        const balance = await props.connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
    })();
  }, [wallet, props.connection]);

  useEffect(refreshCandyMachineState, [wallet, props.candyMachineId, props.connection]);

  return (
    <main>
      <MainContainer>
        <WalletContainer>
          <Logo>
            <a href="https://www.thesocialnfts.com/" target="_blank" rel="noopener noreferrer">
              <img alt="" className="logo" src="logo.png" />
            </a>
          </Logo>
          <Wallet>
            {wallet ? (
              <WalletAmount>
                {(balance || 0).toLocaleString()} SOL
                <ConnectButton />
              </WalletAmount>
            ) : (
              <ConnectButton>Connect Wallet</ConnectButton>
            )}
          </Wallet>
        </WalletContainer>
        <br />

        <MintContainer>
          <NFT elevation={3}>
            <ShimmerTitle>The Social NFTs</ShimmerTitle>
            {wallet && isActive && whitelistEnabled && whitelistTokenBalance > 0 && <h3>You have {whitelistTokenBalance} whitelist mint(s) remaining.</h3>}
            {wallet && isActive && (
              /* <p>Total Minted : {100 - (itemsRemaining * 100 / itemsAvailable)}%</p>}*/

              <div>
                <h3>PRICE : ◎ {price}</h3>
                <h3>
                  TOTAL MINTED : {itemsRedeemed} / {itemsAvailable}
                </h3>
              </div>
            )}
            {wallet && isActive && <BorderLinearProgress variant="determinate" value={100 - (itemsRemaining * 100) / itemsAvailable} />}
            <br />
            <MintButtonContainer>
              {!isActive && candyMachine?.state.goLiveDate ? (
                <Countdown
                  date={toDate(candyMachine?.state.goLiveDate)}
                  onMount={({ completed }) => completed && setIsActive(true)}
                  onComplete={() => {
                    setIsActive(true);
                  }}
                  renderer={renderCounter}
                />
              ) : !wallet ? (
                <ConnectButton>Connect Wallet</ConnectButton>
              ) : candyMachine?.state.gatekeeper && wallet.publicKey && wallet.signTransaction ? (
                <GatewayProvider
                  wallet={{
                    publicKey: wallet.publicKey || new PublicKey(CANDY_MACHINE_PROGRAM),
                    //@ts-ignore
                    signTransaction: wallet.signTransaction,
                  }}
                  // // Replace with following when added
                  // gatekeeperNetwork={candyMachine.state.gatekeeper_network}
                  gatekeeperNetwork={candyMachine?.state?.gatekeeper?.gatekeeperNetwork} // This is the ignite (captcha) network
                  /// Don't need this for mainnet
                  clusterUrl={rpcUrl}
                  options={{ autoShowModal: false }}
                >
                  <MintButton candyMachine={candyMachine} isMinting={isMinting} isActive={isActive} isSoldOut={isSoldOut} onMint={onMint} />
                </GatewayProvider>
              ) : (
                <MintButton candyMachine={candyMachine} isMinting={isMinting} isActive={isActive} isSoldOut={isSoldOut} onMint={onMint} />
              )}
            </MintButtonContainer>
            <br />
            {wallet && isActive && solanaExplorerLink && (
              <SolExplorerLink href={solanaExplorerLink} target="_blank">
                View on Solana Explorer
              </SolExplorerLink>
            )}
          </NFT>
        </MintContainer>
      </MainContainer>
      <Snackbar open={alertState.open} autoHideDuration={6000} onClose={() => setAlertState({ ...alertState, open: false })}>
        <Alert onClose={() => setAlertState({ ...alertState, open: false })} severity={alertState.severity}>
          {alertState.message}
        </Alert>
      </Snackbar>
      <div className="profile">
        <div className="title">
          <h2>The Social NFTs</h2>
          <p>
            The Social NFT consist of 3,000 Generation 1 NFT. It is a revolutionary multi utility NFT that encompasses of online and offline utilities. We are building an exquisite club that will be known not only on the NFT space but in the real
            world as well. Benefits from Airport Lounges, Accessing NFT Vault in our very own Metaverse, yielding from our multi-disciplinary stream of revenue generating incomes to name a few. Traditionally, the world knows it as one stop shop.
          </p>
        </div>
        <div className="profile-img">
          <Image src="nft.gif" alt="NFT To Mint" />
        </div>
      </div>
      <div className="footer">
        <div className="follow">
          <div className="">
            <h2>Follow us</h2>
            <p>Get news &#38; informations</p>
          </div>
          <div className="social-box">
            <a href="https://twitter.com/TheSocialNFTs" target="_blank" rel="noreferrer">
              <img src={twitter} alt="" />
            </a>
            <a href="https://discord.gg/5XydcQrNfJ" target="_blank" rel="noreferrer">
              <img src={discord} alt="" />
            </a>
          </div>
        </div>
        <hr></hr>
        <div className="copyright">
          <p>@ 2022 The Social NFTs</p>
        </div>
      </div>
    </main>
  );
};

export default Home;
