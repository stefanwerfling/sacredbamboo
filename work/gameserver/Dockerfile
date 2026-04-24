FROM golang:1.21-bookworm AS easy-novnc-build
WORKDIR /src
RUN go install github.com/geek1011/easy-novnc@v1.1.0

FROM debian:bookworm
MAINTAINER Stefan Werfling <stefan.werfling@hw-softwareentwicklung.de>

RUN usermod -u 99 nobody && \
    usermod -g 100 nobody

ENV DEBIAN_FRONTEND noninteractive
ENV TERM linux

RUN apt-get update && apt-get upgrade -y --fix-missing
RUN apt-get install apt-utils -y

RUN apt-get -y install wget bzip2 pwgen \
	&& rm -r /var/lib/apt/lists/*

RUN apt-get dist-upgrade
RUN apt-get update && apt-get upgrade -y --fix-missing
RUN apt-get install -y --no-install-recommends debconf-utils

RUN apt-get install -y gnupg2
RUN apt-get install -y lsb-release apt-transport-https ca-certificates

RUN apt-get install -y sudo
RUN apt-get install -y net-tools
RUN apt-get install -y curl

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openbox tigervnc-standalone-server supervisor gosu && \
    rm -rf /var/lib/apt/lists && \
    mkdir -p /usr/share/desktop-directories

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends lxterminal nano wget openssh-client \
    rsync ca-certificates xdg-utils htop tar xzip gzip bzip2 zip unzip && \
    rm -rf /var/lib/apt/lists

RUN apt-get install -y gnupg2
RUN apt-get install -y lsb-release apt-transport-https ca-certificates
RUN apt-get update &&  apt-get upgrade -y --fix-missing
RUN apt-get install -y software-properties-common

RUN dpkg --add-architecture i386
RUN mkdir -p /etc/apt/keyrings && \
    wget -qO- https://dl.winehq.org/wine-builds/winehq.key | gpg --dearmor -o /etc/apt/keyrings/winehq-archive.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/winehq-archive.gpg] https://dl.winehq.org/wine-builds/debian/ bookworm main" \
    > /etc/apt/sources.list.d/winehq.list

RUN apt-get update &&  apt-get upgrade -y --fix-missing
RUN apt-get install -y wine

#COPY assets/hamachi/hamachi.sh /usr/local/bin/

#RUN cd /opt && \
#	curl https://www.vpn.net/installers/logmein-hamachi_2.1.0.203-1_amd64.deb -o /tmp/hamachi.deb && \
#    dpkg -i /tmp/hamachi.deb && \
#    /etc/init.d/logmein-hamachi stop && \
#    rm -f /etc/init.d/logmein-hamachi && \
#    rm -rf /tmp/* && \
#    chmod 755 /usr/local/bin/hamachi.sh


COPY --from=easy-novnc-build /go/bin/easy-novnc /usr/local/bin/
COPY assets/menu.xml /etc/xdg/openbox/
COPY assets/supervisord.conf /etc/
COPY assets/gameserver.sh /opt/gameserver.sh
COPY assets/server /opt/server
#COPY assets/hamachi/start.sh /opt/logmein-hamachi/start.sh
COPY assets/entrypoint.sh /entrypoint.sh

EXPOSE 8080

RUN groupadd --gid 1000 app && \
    useradd --home-dir /data --shell /bin/bash --uid 1000 --gid 1000 app && \
    mkdir -p /data
VOLUME /data

CMD ["sh", "/entrypoint.sh"]
