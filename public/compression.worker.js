/**
 * Compression Worker for Email Content
 * Handles background compression/decompression using lz-string
 * Based on improve2.txt specifications
 */

// Import lz-string for compression (fallback to simple compression if not available)
let LZString;
try {
  // Try to import lz-string if available
  importScripts('https://cdn.jsdelivr.net/npm/lz-string@1.4.4/libs/lz-string.min.js');
  LZString = self.LZString;
} catch (error) {
  console.warn('lz-string not available, using fallback compression');
  // Simple fallback compression
  LZString = {
    compress: (str) => {
      // Simple run-length encoding as fallback
      return str.replace(/(.)\1+/g, (match, char) => {
        return char + match.length;
      });
    },
    decompress: (str) => {
      // Simple run-length decoding
      return str.replace(/(.)\d+/g, (match, char) => {
        const count = parseInt(match.slice(1));
        return char.repeat(count);
      });
    },
    compressToUTF16: function(str) { return this.compress(str); },
    decompressFromUTF16: function(str) { return this.decompress(str); }
  };
}

// Compression thresholds and settings
const COMPRESSION_THRESHOLD = 1024; // Only compress content larger than 1KB
const MAX_COMPRESSION_TIME = 5000; // Max 5 seconds for compression
const CHUNK_SIZE = 64 * 1024; // Process in 64KB chunks for large content

// Performance monitoring
let compressionStats = {
  totalCompressions: 0,
  totalDecompressions: 0,
  totalCompressionTime: 0,
  totalDecompressionTime: 0,
  averageCompressionRatio: 0,
  bytesCompressed: 0,
  bytesDecompressed: 0
};

/**
 * Compress data with performance monitoring
 */
function compressData(data, options = {}) {
  const startTime = performance.now();
  const { algorithm = 'lz-string', level = 'default' } = options;
  
  try {
    let compressed;
    const originalSize = new Blob([data]).size;
    
    // Skip compression for small data
    if (originalSize < COMPRESSION_THRESHOLD) {
      return {
        data: data,
        compressed: false,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
        algorithm: 'none',
        compressionTime: 0
      };
    }
    
    // Choose compression algorithm
    switch (algorithm) {
      case 'lz-string':
        if (level === 'fast') {
          compressed = LZString.compress(data);
        } else {
          compressed = LZString.compressToUTF16(data);
        }
        break;
      
      case 'chunked':
        // For very large content, compress in chunks
        compressed = compressInChunks(data);
        break;
        
      default:
        compressed = LZString.compressToUTF16(data);
    }
    
    const compressedSize = new Blob([compressed]).size;
    const compressionRatio = originalSize / compressedSize;
    const compressionTime = performance.now() - startTime;
    
    // Update statistics
    compressionStats.totalCompressions++;
    compressionStats.totalCompressionTime += compressionTime;
    compressionStats.bytesCompressed += originalSize;
    compressionStats.averageCompressionRatio = 
      (compressionStats.averageCompressionRatio * (compressionStats.totalCompressions - 1) + compressionRatio) / 
      compressionStats.totalCompressions;
    
    return {
      data: compressed,
      compressed: true,
      originalSize,
      compressedSize,
      compressionRatio,
      algorithm,
      compressionTime
    };
    
  } catch (error) {
    console.error('Compression failed:', error);
    return {
      data: data,
      compressed: false,
      originalSize: new Blob([data]).size,
      compressedSize: new Blob([data]).size,
      compressionRatio: 1,
      algorithm: 'none',
      compressionTime: performance.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Decompress data with performance monitoring
 */
function decompressData(compressedData, metadata = {}) {
  const startTime = performance.now();
  const { algorithm = 'lz-string', compressed = true } = metadata;
  
  try {
    if (!compressed) {
      return {
        data: compressedData,
        decompressed: false,
        decompressionTime: 0
      };
    }
    
    let decompressed;
    
    switch (algorithm) {
      case 'lz-string':
        // Try UTF16 first, fallback to regular
        try {
          decompressed = LZString.decompressFromUTF16(compressedData);
          if (!decompressed) {
            decompressed = LZString.decompress(compressedData);
          }
        } catch {
          decompressed = LZString.decompress(compressedData);
        }
        break;
        
      case 'chunked':
        decompressed = decompressFromChunks(compressedData);
        break;
        
      default:
        decompressed = LZString.decompressFromUTF16(compressedData);
    }
    
    const decompressionTime = performance.now() - startTime;
    
    // Update statistics
    compressionStats.totalDecompressions++;
    compressionStats.totalDecompressionTime += decompressionTime;
    compressionStats.bytesDecompressed += new Blob([decompressed || '']).size;
    
    return {
      data: decompressed,
      decompressed: true,
      decompressionTime
    };
    
  } catch (error) {
    console.error('Decompression failed:', error);
    return {
      data: compressedData,
      decompressed: false,
      decompressionTime: performance.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Compress large content in chunks to avoid blocking
 */
function compressInChunks(data) {
  const chunks = [];
  const totalLength = data.length;
  
  for (let i = 0; i < totalLength; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    const compressedChunk = LZString.compressToUTF16(chunk);
    chunks.push(compressedChunk);
    
    // Yield control periodically for large files
    if (i % (CHUNK_SIZE * 10) === 0) {
      // This would be where we'd yield in a more sophisticated implementation
    }
  }
  
  return JSON.stringify({
    type: 'chunked',
    chunks: chunks,
    originalLength: totalLength
  });
}

/**
 * Decompress chunked content
 */
function decompressFromChunks(compressedData) {
  try {
    const parsed = JSON.parse(compressedData);
    if (parsed.type !== 'chunked') {
      throw new Error('Invalid chunked data format');
    }
    
    const decompressedChunks = parsed.chunks.map(chunk => 
      LZString.decompressFromUTF16(chunk)
    );
    
    return decompressedChunks.join('');
  } catch (error) {
    console.error('Chunked decompression failed:', error);
    return compressedData;
  }
}

/**
 * Analyze content to determine optimal compression strategy
 */
function analyzeContent(data) {
  const size = new Blob([data]).size;
  const isHTML = data.includes('<html') || data.includes('<!DOCTYPE');
  const isJSON = data.trim().startsWith('{') || data.trim().startsWith('[');
  const hasRepeatedPatterns = /(.{10,}).*\1/.test(data.slice(0, 1000));
  
  let recommendedAlgorithm = 'lz-string';
  let recommendedLevel = 'default';
  
  if (size > 100 * 1024) { // > 100KB
    recommendedAlgorithm = 'chunked';
  } else if (size < COMPRESSION_THRESHOLD) {
    recommendedAlgorithm = 'none';
  } else if (hasRepeatedPatterns || isHTML) {
    recommendedLevel = 'default'; // Better compression
  } else {
    recommendedLevel = 'fast'; // Faster compression
  }
  
  return {
    size,
    isHTML,
    isJSON,
    hasRepeatedPatterns,
    recommendedAlgorithm,
    recommendedLevel
  };
}

/**
 * Get compression statistics
 */
function getStats() {
  return {
    ...compressionStats,
    averageCompressionTime: compressionStats.totalCompressions > 0 ? 
      compressionStats.totalCompressionTime / compressionStats.totalCompressions : 0,
    averageDecompressionTime: compressionStats.totalDecompressions > 0 ? 
      compressionStats.totalDecompressionTime / compressionStats.totalDecompressions : 0
  };
}

/**
 * Reset statistics
 */
function resetStats() {
  compressionStats = {
    totalCompressions: 0,
    totalDecompressions: 0,
    totalCompressionTime: 0,
    totalDecompressionTime: 0,
    averageCompressionRatio: 0,
    bytesCompressed: 0,
    bytesDecompressed: 0
  };
}

// Message handler
self.onmessage = function(e) {
  const { type, data, options, metadata, id } = e.data;
  
  try {
    let result;
    
    switch (type) {
      case 'compress':
        const analysis = analyzeContent(data);
        const compressionOptions = {
          algorithm: analysis.recommendedAlgorithm,
          level: analysis.recommendedLevel,
          ...options
        };
        result = compressData(data, compressionOptions);
        self.postMessage({ 
          type: 'compressed', 
          result, 
          analysis,
          id 
        });
        break;
        
      case 'decompress':
        result = decompressData(data, metadata);
        self.postMessage({ 
          type: 'decompressed', 
          result,
          id 
        });
        break;
        
      case 'analyze':
        result = analyzeContent(data);
        self.postMessage({ 
          type: 'analyzed', 
          result,
          id 
        });
        break;
        
      case 'stats':
        result = getStats();
        self.postMessage({ 
          type: 'stats', 
          result,
          id 
        });
        break;
        
      case 'reset-stats':
        resetStats();
        self.postMessage({ 
          type: 'stats-reset', 
          result: true,
          id 
        });
        break;
        
      default:
        self.postMessage({ 
          type: 'error', 
          error: `Unknown message type: ${type}`,
          id 
        });
    }
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      error: error.message,
      stack: error.stack,
      id 
    });
  }
};

// Handle worker errors
self.onerror = function(error) {
  console.error('Compression worker error:', error);
  self.postMessage({ 
    type: 'error', 
    error: error.message || 'Unknown worker error'
  });
};

// Periodic statistics reporting (every 5 minutes)
setInterval(() => {
  if (compressionStats.totalCompressions > 0 || compressionStats.totalDecompressions > 0) {
    self.postMessage({ 
      type: 'stats-report', 
      result: getStats() 
    });
  }
}, 5 * 60 * 1000);

console.log('Compression worker initialized');