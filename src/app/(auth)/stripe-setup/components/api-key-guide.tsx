import { motion } from "framer-motion";
import forge from "node-forge";
import { ExternalLink, Key, Lock, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import axios from "axios";
import { Loader } from "@/components/ui/loader";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const stripeKeysUrl = process.env
  .NEXT_PUBLIC_STRIPE_API_KEYS_ENDPOINT as string;

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.success("Copied to clipboard");
};

interface Step {
  title: string;
  description: React.ReactNode;
  image?: string | string[];
  action?: React.ReactNode;
}

const steps: Step[] = [
  {
    title: "Create Restricted Key",
    description: (
      <div className="space-y-2">
        <div className="space-y-1">
          <p>1. Navigate to the Stripe API keys section</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href={stripeKeysUrl} target="_blank">
              Open Stripe Dashboard <ExternalLink className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
        <p>
          2. Click the &apos;Create restricted key&apos; button in the top right
        </p>
      </div>
    ),
    image: "/generate-api-key/stripe-step1.png",
  },
  {
    title: "Select Key Usage",
    description: (
      <p>
        Choose <strong>Providing this key to another website</strong> and{" "}
        <strong>continue</strong>
      </p>
    ),
    image: "/generate-api-key/stripe-step2.png",
  },
  {
    title: "Configure Key Details",
    description: (
      <div className="space-y-2">
        <p>1. Enter &quot;StripeGuard&quot; as the name</p>
        <p>
          2. Set the URL to:{" "}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger
                className="bg-secondary/50 px-2 py-1 rounded cursor-pointer font-mono"
                onClick={() => copyToClipboard(appUrl!)}
              >
                {appUrl}
              </TooltipTrigger>
              <TooltipContent>Copy to clipboard</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </p>
        <p className="font-bold text-foreground">
          3. Important: Check &quot;Customize permissions for this key&quot;
        </p>
        <p>
          (
          <Dialog>
            <DialogTrigger asChild>
              <span className="text-primary cursor-pointer underline">
                I forgot to check
              </span>
            </DialogTrigger>
            <DialogContent>
              <p>
                Find the key and press: <strong>...</strong> →{" "}
                <strong>Edit key...</strong>
              </p>
              <img
                src="/generate-api-key/stripe-step-forgot.png"
                alt="Forgot to check"
                className="rounded-lg border border-border/50 shadow-md"
              />
            </DialogContent>
          </Dialog>
          )
        </p>
      </div>
    ),
    image: ["/generate-api-key/stripe-step3.png"],
  },
  {
    title: "Set Permissions",
    description: (
      <p>
        Scroll to <strong>All webhook resources</strong> and select{" "}
        <strong>Write</strong> permission
      </p>
    ),
    image: "/generate-api-key/stripe-step4.png",
  },
];

export default function ApiKeyGuide() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSaveApiKey = async () => {
    const isKeyVerified = apiKey.startsWith("rk_");

    if (!isKeyVerified) {
      toast.error("Invalid API key");
      return;
    }
    if (loading) return;
    setLoading(true);

    const publicKeyPem = process.env
      .NEXT_PUBLIC_STRIPE_KEY_ENCRYPTION_KEY as string;
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const encryptedData = publicKey.encrypt(apiKey, "RSA-OAEP", {
      md: forge.md.sha256.create(),
    });
    try {
      await axios.post("/api/stripe/user/setup", {
        apiKey: forge.util.encode64(encryptedData),
      });
      toast.success("API key saved securely! 🚀");
      router.push("/dashboard");
    } catch (error) {
      console.error(error);
      toast.error("Error saving API key");
      setLoading(false);
      return;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-8 items-center relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full"
      >
        <Button variant="outline" className="mb-4" asChild>
          <Link href="/stripe-setup">
            <ArrowLeft className="w-4 h-4 mr-2" /> I want a different setup
          </Link>
        </Button>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4"
      >
        <Key className="w-12 h-12 text-primary mx-auto" />
        <h1 className="text-3xl font-bold">Generate Your API Key</h1>
        <p className="text-muted-foreground">
          Follow these steps to create a restricted API key for StripeGuard
        </p>
      </motion.div>

      <div className="space-y-12">
        {steps.map((step, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-card rounded-xl p-6 shadow-lg border border-border/50"
          >
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 rounded-full w-8 h-8 flex justify-center items-center">
                <span className="text-primary font-semibold text-center">
                  {index + 1}
                </span>
              </div>
              <div className="space-y-4 flex-1">
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <div className="text-muted-foreground">{step.description}</div>
                {step.image &&
                  (Array.isArray(step.image) ? (
                    <div className="flex flex-col gap-4">
                      {step.image.map((image, index) => (
                        <img
                          key={index}
                          src={image}
                          alt={`Step ${index + 1}`}
                          className="rounded-lg border border-border/50 shadow-md"
                        />
                      ))}
                    </div>
                  ) : (
                    <img
                      src={step.image}
                      alt={`Step ${index + 1}`}
                      className="rounded-lg border border-border/50 shadow-md mt-4"
                    />
                  ))}
              </div>
            </div>
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: steps.length * 0.1 }}
          className="w-full mx-auto bottom-0 bg-card rounded-xl p-6 shadow-lg border border-border/50 flex"
        >
          <form
            onSubmit={() => {
              handleSaveApiKey();
            }}
            className="space-y-4 w-full"
          >
            <div className="space-y-1 w-full">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-semibold">Enter Your API Key</h3>
              </div>
              <p className="text-muted-foreground">
                Once you&apos;ve created your restricted key,{" "}
                <strong>copy it</strong> and <strong>paste</strong> it below
              </p>
            </div>
            <img
              src="/generate-api-key/stripe-step5.png"
              alt="Step 5"
              className="rounded-lg border border-border/50 shadow-md mt-4"
            />
            <div className="space-y-2">
              <Label htmlFor="apiKey">Restricted API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="rk_live_..."
                className="font-mono"
              />
            </div>
            <div className="w-full space-y-1">
              <Button
                type="submit"
                className="w-full"
                disabled={!apiKey || loading}
                onClick={() => handleSaveApiKey()}
              >
                {loading && <Loader className="text-foreground" />}
                Save API Key <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <p className="text-muted-foreground text-center text-xs flex flex-row gap-1 justify-center items-center">
                <Lock className="w-3 h-3 text-muted-foreground" /> Data is
                encrypted on transfer
              </p>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}