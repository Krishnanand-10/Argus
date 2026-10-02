# Attention Is All You Need: Transformer Architectures

The Transformer architecture revolutionized natural language processing and modern deep learning. By replacing recurrent neural networks (RNNs) and convolutional networks with multi-head self-attention mechanisms, Transformers enable massive parallelization during training.

## Self-Attention Mechanism
Self-attention computes a representation of a sequence by relating different positions of the same sequence. Queries (Q), Keys (K), and Values (V) vectors are projected from the token embeddings:

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

## Large Language Models
Modern foundation models, including Gemini, GPT, and Claude, rely on decoder-only or encoder-decoder Transformer stacks to perform zero-shot and few-shot reasoning across complex textual and multimodal tasks.
