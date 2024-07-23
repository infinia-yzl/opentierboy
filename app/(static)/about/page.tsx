import React from 'react';
import {Card, CardContent, CardHeader} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {DiscordLogoIcon, GitHubLogoIcon} from "@radix-ui/react-icons";
import Image from "next/image";
import otbLogo from "@/public/brand/otb-logo-wide.webp";

const AboutPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl md:text-3xl font-light mb-12 flex flex-col justify-center">
          <div className="flex justify-center mb-6 max-w-[600]">
            <Image src={otbLogo} alt="OpenTierBoy" priority/>
          </div>
          Craft, rank and share your passion - the open-source way!
        </h1>
      </section>

      {/* Mission Section */}
      <div className="relative w-screen left-1/2 right-1/2 -mx-[50vw] bg-primary text-primary-foreground">
        <section className="py-20 max-w-screen-lg mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold mb-8">Mission</h2>
          <h3 className="text-3xl md:text-4xl font-bold mb-6">A message from the founder</h3>
          <p className="text-xl leading-relaxed mb-6">
            I started OpenTierBoy with a simple goal: to make tier list creation fun, free, and accessible.
            Something so simple shouldn&apos;t be suffocated with intrusive ads, and an overall poor user experience.
            I believe our community deserves nothing less.
          </p>
          <h3 className="text-3xl md:text-4xl font-bold mb-6">Our Collective Mission</h3>
          <p className="text-xl leading-relaxed">
            Together, our mission is to provide a free and easy platform where everyone can easily create and share
            their tier lists with a focus on our core users.
          </p>
        </section>
      </div>

      {/* Approach Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold mb-12 text-center">Our Approach</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="col-span-3">
              <CardHeader>
                <h3 className="text-2xl font-semibold">Community Driven & Open-Source</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-lg">
                  OpenTierBoy takes a unique approach to tier list creation. Instead of relying on a centralized
                  database where user-uploaded assets often become cluttered and irrelevant for most other users, we
                  focus on providing a core set of high-quality, community-vetted templates.
                </p>
                <p className="text-sm text-muted-foreground py-2">What about my own images?</p>
                <p className="text-lg">
                  Don&apos;t worry – you can still add your own custom images to your tier lists! You have the freedom
                  to upload and use custom images within your personal creations. The key difference is that these
                  custom images aren&apos;t saved to a central database. This affords you the flexibility to create your
                  unique tier lists without cluttering the experience for others.
                </p>
                <p className="text-lg">
                  And let&apos;s be honest – most users don&apos;t need to save and share their custom images anyway.
                  You can still easily share your completed tier lists as images, which is what matters most.
                </p>
                <blockquote className="mt-6 border-l-2 pl-6 italic">
                  &quot;I recommend keeping folders on your device for each of your tier lists, and saving your custom
                  images there so you can quickly add them.&quot;
                </blockquote>
                <p className="text-sm text-muted-foreground py-2">Okay, so what about the templates?</p>
                <p className="text-lg">
                  Our templates are curated through our open-source assets packages, ensuring a high-quality selection
                  of the most popular and useful options. This approach leads to faster load times, no reliance on
                  external servers, and a more stable, performant tool.
                </p>
                <p className="text-lg">
                  While creating custom templates requires contributing to our assets package, we believe this trade-off
                  results in a better experience for the vast majority of users.
                </p>
                <p className="text-sm text-muted-foreground py-2">Can I help?</p>
                <p className="text-lg">
                  You&apos;re invited to peek under the hood, suggest improvements, contribute new templates, or even
                  fork the project. We <i>truly</i> value your help and contributions to OpenTierBoy.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-2xl font-semibold">Ad-Free Experience</h3>
              </CardHeader>
              <CardContent>
                <p className="text-lg">
                  We don&apos;t serve ads or track our users, ensuring a clean and respectable
                  environment for your tier list creations.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-2xl font-semibold">Easy Sharing</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-lg">
                  Generate a unique URL that captures your tier list almost exactly as you made it.
                </p>
                <p className="text-lg">
                  Or, save it as an image / video like you are used to.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-2xl font-semibold">Customizable</h3>
              </CardHeader>
              <CardContent>
                <p className="text-lg">
                  Upload your own images, change the tiers, make it yours!
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Community Section */}
      <section className="py-20">
        <Card className="bg-primary text-primary-foreground p-4">
          <CardHeader>
            <h2 className="text-4xl md:text-5xl font-bold text-center">Build With Us!</h2>
          </CardHeader>
          <CardContent className="text-center px-8">
            <p className="text-xl leading-relaxed">
              Join us in shaping the future of OpenTierBoy, making it the go-to tool for creating tier lists.
            </p>
            <p className="text-sm text-muted mb-8">
              And who knows? Your contributions could shape not just OpenTierBoy, but potentially spark ideas for more
              open-source tools in the future.
            </p>
            <div className="flex justify-center space-x-4 mb-6">
              <Button variant="secondary" asChild>
                <a href="https://github.com/infinia-yzl/opentierboy" className="flex items-center space-x-2"
                   aria-label="GitHub">
                  <GitHubLogoIcon className="h-5 w-5"/>
                  <span>Contribute on GitHub</span>
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="https://discord.gg/CEtDSHV38b" className="flex items-center space-x-2" aria-label="Discord">
                  <DiscordLogoIcon className="h-5 w-5"/>
                  <span>Join our Discord</span>
                </a>
              </Button>
            </div>
            <p className="text-lg font-semibold">
              Let&apos;s build amazing tools that we&apos;d use, together!
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default AboutPage;
