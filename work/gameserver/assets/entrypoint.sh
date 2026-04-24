#!/bin/sh

#sh /opt/logmein-hamachi/start.sh

chown app:app /data /dev/stdout
exec gosu app supervisord
