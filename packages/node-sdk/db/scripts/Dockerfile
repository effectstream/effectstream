FROM postgres:15.9 AS builder

RUN apt-get update && apt-get -y install git postgresql-server-dev-15 build-essential && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/sraoss/pg_ivm
WORKDIR /pg_ivm

RUN git checkout v1.11
RUN make
RUN make DESTDIR=/pg_ivm/output install

FROM postgres:15.9
COPY --from=builder /pg_ivm/output /