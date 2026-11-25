/* This file is part of the OpenMV project.
 * Copyright (c) 2013-2017 Ibrahim Abdelkader <iabdalkader@openmv.io> & Kwabena W. Agyeman <kwagyeman@openmv.io>
 * This work is licensed under the MIT license, see the file LICENSE for details.
 */

#include "collections.h"
#include <stdlib.h>
#include <string.h>
#include "esp32-hal-psram.h"
#define CHAR_BITS (sizeof(char) * 8)
#define CHAR_MASK (CHAR_BITS - 1)
#define CHAR_SHIFT IM_LOG2(CHAR_MASK)

//////////
// lifo //
//////////

void lifo_alloc(lifo_t *ptr, size_t size, size_t data_len)
{
  ptr->len = 0;
  ptr->size = size;
  ptr->data_len = data_len;
  ptr->data = (char *)ps_malloc(size * data_len);
}

// Stack for quirc's flood fill, which keeps one entry per row it walks down. The ESP32 port this
// came from gave it only 255 bytes (31 entries), so any QR finder square taller than ~31 pixels
// was traced only partly and the code then failed its error check. One 32 KB buffer (4096
// entries) is allocated once and reused: the flood fill runs only in the QR task and never nests.
#define LIFO_ALL_BYTES (32 * 1024)
static char *lifo_all_buffer = NULL;

void lifo_alloc_all(lifo_t *ptr, size_t *size, size_t data_len)
{
  if (lifo_all_buffer == NULL)
  {
    lifo_all_buffer = (char *)ps_malloc(LIFO_ALL_BYTES);
  }
  ptr->data = lifo_all_buffer;
  ptr->data_len = data_len;
  ptr->size = lifo_all_buffer ? LIFO_ALL_BYTES / data_len : 0;
  ptr->len = 0;
  *size = ptr->size;
}

void lifo_free(lifo_t *ptr)
{
  if (ptr->data && ptr->data != lifo_all_buffer)
  {
    free(ptr->data);
  }
  ptr->data = NULL;
}

void lifo_clear(lifo_t *ptr)
{
  ptr->len = 0;
}

size_t lifo_size(lifo_t *ptr)
{
  return ptr->len;
}

bool lifo_is_not_empty(lifo_t *ptr)
{
  return ptr->len;
}

bool lifo_is_not_full(lifo_t *ptr)
{
  return ptr->len != ptr->size;
}

void lifo_enqueue(lifo_t *ptr, void *data)
{
  memcpy(ptr->data + (ptr->len * ptr->data_len), data, ptr->data_len);

  ptr->len += 1;
}

void lifo_dequeue(lifo_t *ptr, void *data)
{
  if (data)
  {
    memcpy(data, ptr->data + ((ptr->len - 1) * ptr->data_len), ptr->data_len);
  }

  ptr->len -= 1;
}

void lifo_poke(lifo_t *ptr, void *data)
{
  memcpy(ptr->data + (ptr->len * ptr->data_len), data, ptr->data_len);
}

void lifo_peek(lifo_t *ptr, void *data)
{
  memcpy(data, ptr->data + ((ptr->len - 1) * ptr->data_len), ptr->data_len);
}
