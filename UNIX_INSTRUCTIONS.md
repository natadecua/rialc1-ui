To make the shell scripts executable on Unix systems (Linux, macOS), run the following commands in your terminal:

```bash
# Navigate to your project directory
cd /path/to/rialc1-ui

# Make the shell scripts executable
chmod +x cleanup_unused_files.sh
chmod +x cleanup_unused_tiles.sh
```

Once you've done this, you can run the cleanup scripts using either:

```bash
# Option 1: Using npm scripts
npm run clean:unix
npm run cleantiles:unix

# Option 2: Running the scripts directly
./cleanup_unused_files.sh
./cleanup_unused_tiles.sh
```

This ensures that users on any platform (Windows, Linux, or macOS) can run the cleanup utilities.