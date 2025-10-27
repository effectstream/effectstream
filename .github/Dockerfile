# Use Ubuntu as base image
FROM denoland/deno:ubuntu-2.5.4


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
    # xz is required for compactc
    xz-utils \
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

# Install Compact
RUN curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
ENV PATH="/root/.local/bin:$PATH"
RUN which compact
RUN compact update
RUN compact --version
RUN compact compile --version

# Copy the patch script
COPY ./patch.sh /app/patch.sh
RUN chmod +x /app/patch.sh

# Clone the repository
COPY . .

# Ensure the script can run tests properly in Docker
RUN echo "export DENO_DIR=/tmp/.deno" >> /root/.bashrc

# Set environment variables for better script execution
ENV NODE_ENV=development
ENV DENO_DIR=/tmp/.deno

RUN deno install --allow-scripts
RUN /app/patch.sh

RUN deno task -r contract:compile

RUN deno task -f @e2e/wallets-ui build

# START E2E TESTS
# Yaci Devkit failing on linux
ENV DISABLE_LINUX_YACI=true
# Show Paima-Engine logs
ENV PAIMA_E2E_LOG_DEBUG=true
CMD ["deno", "task", "-f", "@e2e/node", "test"]
