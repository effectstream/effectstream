# Use Ubuntu as base image
FROM denoland/deno:ubuntu-2.4.1

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV DENO_INSTALL=/root/.deno
ENV PATH=$DENO_INSTALL/bin:$PATH

# Update package list and install required dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    gnupg \
    lsb-release \
    unzip \
    sed \
    # We have some scripts that use lsof
    lsof \
    # iproute2 is required for ss command - for dkill.
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
# Initialize core-js running 'postinstall' script requires node, or fails.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Verify Deno installation
RUN deno --version

# Verify Node.js installation
RUN node --version && npm --version

# Install Foundry
# RUN curl -L https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_arm64.tar.gz -o foundry.tar.gz \
RUN curl -L https://github.com/foundry-rs/foundry/releases/download/v1.3.0-rc1/foundry_v1.3.0-rc1_alpine_amd64.tar.gz -o foundry.tar.gz \
    && tar -xzf foundry.tar.gz \
    && mv anvil cast chisel forge /usr/local/bin/ \
    && rm -rf foundry.tar.gz

# Verify Foundry installation
RUN forge --version && cast --version && anvil --version

# Create working directory
WORKDIR /app

# Copy the launch script
COPY .github/launch.sh /app/launch.sh
RUN chmod +x /app/launch.sh


# Clone the repository
COPY . .

# Ensure the script can run tests properly in Docker
RUN echo "export DENO_DIR=/tmp/.deno" >> /root/.bashrc

# Set environment variables for better script execution
ENV NODE_ENV=development
ENV DENO_DIR=/tmp/.deno

RUN npm install -g @bloxbean/yaci-devkit
RUN yaci-devkit up --port 3002 & 
# Waiting for port is not working as expected.
RUN sleep 60

# Set the default command to run the launch script
CMD ["/app/launch.sh"]
