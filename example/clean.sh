#!/bin/sh

#------------------------------------------------------------------------------
# This script will clean up any local file systems files left over and put
# your sample back into a "clean" state

# Remove the REDIS file system to wipe out all accounts stored in the system
rm -rf appendonly.aof

# Remove any JSON config files
rm -rf *.json
