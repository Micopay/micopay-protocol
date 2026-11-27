FROM ubuntu:24.04
RUN apt-get update && apt-get install -y curl git bash ca-certificates libc++1 jq && rm -rf /var/lib/apt/lists/*
ENV PATH="/root/.nargo/bin:/root/.bb:/root/.bb/bin:${PATH}"
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash && /root/.nargo/bin/noirup -v 1.0.0-beta.9
RUN curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash && (/root/.bb/bbup -v 0.87.0 || /root/.bb/bin/bbup -v 0.87.0)
WORKDIR /work
